import Publisher from '../publisher.js';
import { streamFromBlob } from './blob-polyfill.js';
import jsonExt from '/gen/@discoveryjs/json-ext.js';

export const stages = {
    request: {
        value: 0.0,
        title: 'Awaiting data'
    },
    receive: {
        value: 0.1,
        title: 'Receiving data'
    },
    parse: {
        value: 0.9,
        title: 'Processing data (parse)'
    },
    apply: {
        value: 0.925,
        title: 'Processing data (prepare)'
    },
    done: {
        value: 1.0,
        title: 'Done!'
    }
};
Object.values(stages).forEach((item, idx, array) => {
    item.duration = (idx !== array.length - 1 ? array[idx + 1].value : 0) - item.value;
});

const letRepaintIfNeeded = async () => {
    await new Promise(resolve => setTimeout(resolve, 1));

    if (!document.hidden) {
        return Promise.race([
            new Promise(requestAnimationFrame),
            new Promise(resolve => setTimeout(resolve, 16))
        ]);
    }
};

export function jsonFromStream(stream, totalSize, setProgress = () => {}) {
    return jsonExt.parseStream(async function*() {
        const reader = stream.getReader();
        const streamStartTime = Date.now();
        let completed = 0;
        let awaitRepaint = Date.now();

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    setProgress({
                        done: true,
                        elapsed: Date.now() - streamStartTime,
                        type: 'bytes',
                        completed,
                        total: totalSize
                    });
                    break;
                }

                completed += value.length;
                yield value;

                setProgress({
                    done: false,
                    elapsed: Date.now() - streamStartTime,
                    type: 'bytes',
                    completed,
                    total: totalSize
                });

                if (Date.now() - awaitRepaint > 65) {
                    await letRepaintIfNeeded();
                    awaitRepaint = Date.now();
                }
            }
        } finally {
            reader.releaseLock();
        }
    });
}

async function loadDataFromStreamInternal(request, applyData, progress, timing) {
    const stage = async (stage, fn = () => {}) => {
        try {
            progress.set({ stage });
            await letRepaintIfNeeded();
            return await fn();
        } finally {
            timing.set({ stage, elapsed: elapsed.time() });
            await letRepaintIfNeeded();
        }
    };
    const elapsed = {
        start: Date.now(),
        time() {
            return -this.start + (this.start = Date.now());
        }
    };

    try {
        const { stream, data: explicitData, totalSize } = await stage('request', request);
        const data = explicitData || await stage('receive', () =>
            jsonFromStream(stream, totalSize, state => progress.set({
                stage: 'receive',
                progress: state
            }))
        );

        await stage('apply', () => applyData(data));
        progress.set({ stage: 'done' });
    } catch (error) {
        progress.set({ stage: 'error', error });
        console.error('[Discovery] Error loading data:', error);
    }
}

export function loadDataFromStream(request, applyData) {
    const state = new Publisher();
    const timing = new Publisher();

    // encapsulate logic into separate function since it's async,
    // but we need to return publisher to start tracking progress
    loadDataFromStreamInternal(
        request,
        applyData,
        state,
        timing
    );

    return {
        state,
        timing,
        result: new Promise((resolve, reject) =>
            state.subscribe(({ stage, error }, unsubscribe) => {
                if (error) {
                    unsubscribe();
                    reject(error);
                } else if (stage === 'done') {
                    unsubscribe();
                    resolve();
                }
            })
        )
    };
}

export function loadDataFromEvent(event, applyData) {
    const source = event.dataTransfer || event.target;
    const file = source && source.files && source.files[0];

    event.stopPropagation();
    event.preventDefault();

    return loadDataFromFile(file, applyData);
}

export function loadDataFromFile(file, applyData) {
    return loadDataFromStream(
        () => {
            if (file.type !== 'application/json') {
                throw new Error('Not a JSON file');
            }

            return {
                stream: streamFromBlob(file),
                totalSize: file.size
            };
        },
        data => applyData(data, {
            name: `Discover file: ${file.name}`,
            createdAt: new Date(file.lastModified || Date.now()),
            data
        })
    );
}

export function loadDataFromUrl(url, applyData, dataField) {
    const explicitData = typeof url === 'string' ? undefined : url;

    return loadDataFromStream(
        async () => {
            const response = await fetch(explicitData ? 'data:application/json,{}' : url);

            if (response.ok) {
                return explicitData ? { data: explicitData } : {
                    stream: response.body,
                    totalSize:
                        Number(response.headers.get('x-file-size')) ||
                        (!response.headers.get('content-encoding') && Number(response.headers.get('x-file-size')))
                };
            }

            let error = await response.text();

            if (response.headers.get('content-type') === 'application/json') {
                const json = JSON.parse(error);
                error = json.error || json;
            }

            error = new Error(error);
            error.stack = null;
            throw error;
        },
        data => applyData(
            dataField ? data[dataField] : data,
            {
                name: 'Discovery',
                createdAt: dataField && data.createdAt ? new Date(Date.parse(data.createdAt)) : new Date(),
                ...dataField ? data : { data: data }
            }
        )
    );
}
