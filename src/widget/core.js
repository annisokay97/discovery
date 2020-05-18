/* eslint-env browser */

import Emitter from '../core/emitter.js';
import ViewRenderer from '../core/view.js';
import PresetRenderer from '../core/preset.js';
import ObjectMarker from '../core/object-maker.js';
import * as views from '../views/index.js';
import { createElement } from '../core/utils/dom.js';
import { fuzzyStringCompare } from '../core/utils/compare.js';
import * as lib from '../lib.js';
import jora from '/gen/jora.js'; // FIXME: generated file to make it local

const lastSetDataPromise = new WeakMap();
const lastQuerySuggestionsStat = new WeakMap();

function genUniqueId(len = 16) {
    const base36 = val => Math.round(val).toString(36);
    let uid = base36(10 + 25 * Math.random()); // uid should starts with alpha

    while (uid.length < len) {
        uid += base36(Date.now() * Math.random());
    }

    return uid.substr(0, len);
}

function createDataExtensionApi(instance) {
    const objectMarkers = new ObjectMarker();
    const linkResolvers = [];
    const annotations = [];
    const queryExtensions = {
        query: (...args) => instance.query(...args),
        pageLink: (pageRef, pageId, pageParams) =>
            instance.encodePageHash(pageId, pageRef, pageParams),
        marker: (current, type) => objectMarkers.lookup(current, type),
        markerAll: (current) => objectMarkers.lookupAll(current)
    };
    const addValueAnnotation = (query, options = false) => {
        if (typeof options === 'boolean') {
            options = {
                debug: options
            };
        }

        annotations.push({
            query,
            ...options
        });
    };

    return {
        apply() {
            Object.assign(instance, {
                objectMarkers,
                linkResolvers,
                annotations,
                queryExtensions
            });
        },
        methods: {
            defineObjectMarker(name, options) {
                const { page, mark, lookup } = objectMarkers.define(name, options) || {};

                if (!lookup) {
                    return () => {};
                }

                if (page !== null) {
                    if (!instance.page.isDefined(options.page)) {
                        console.error(`[Discovery] Page reference "${options.page}" doesn't exist`);
                        return;
                    }

                    linkResolvers.push(value => {
                        const marker = lookup(value);

                        if (marker !== null) {
                            return {
                                type: page,
                                text: marker.title,
                                href: marker.href,
                                entity: marker.object
                            };
                        }
                    });

                    addValueAnnotation((value, context) => {
                        const marker = lookup(value);

                        if (marker && marker.object !== context.host) {
                            return {
                                place: 'before',
                                style: 'badge',
                                text: page,
                                href: marker.href
                            };
                        }
                    });
                } else {
                    addValueAnnotation((value, context) => {
                        const marker = lookup(value);

                        if (marker && marker.object !== context.host) {
                            return {
                                place: 'before',
                                style: 'badge',
                                text: name
                            };
                        }
                    });
                }

                return mark;
            },
            addValueAnnotation,
            addQueryHelpers(helpers) {
                Object.assign(queryExtensions, helpers);
            }
        }
    };
}

export default class Core extends Emitter {
    constructor(container, options) {
        super();

        this.lib = lib; // FIXME: temporary solution to expose discovery's lib API

        this.options = options || {};
        this.view = new ViewRenderer(this);
        this.preset = new PresetRenderer(this.view);

        this.prepare = data => data;
        this.objectMarkers = [];
        this.linkResolvers = [];
        this.annotations = [];
        this.queryExtensions = {
            query: (...args) => this.query(...args)
        };

        this.instanceId = genUniqueId();
        this.isolateStyleMarker = this.options.isolateStyleMarker || 'style-boundary-8H37xEyN';
        this.dom = {};

        this.apply(views);

        if (this.options.extensions) {
            this.apply(this.options.extensions);
        }

        this.setContainer(container);
    }

    apply(extensions) {
        if (Array.isArray(extensions)) {
            extensions.forEach(extension => this.apply(extension));
        } else if (typeof extensions === 'function') {
            extensions.call(window, this);
        } else if (extensions) {
            this.apply(Object.values(extensions));
        } else {
            console.error('Bad type of extension:', extensions);
        }
    }

    //
    // Data
    //

    setPrepare(fn) {
        if (typeof fn !== 'function') {
            throw new Error('An argument should be a function');
        }

        this.prepare = fn;
    }

    setData(data, context = {}) {
        const startTime = Date.now();
        const dataExtension = createDataExtensionApi(this);
        this._extensitionApi = dataExtension.methods; // TODO: remove
        const checkIsNotPrevented = () => {
            const lastPromise = lastSetDataPromise.get(this);

            // prevent race conditions, perform only if this promise is last one
            if (lastPromise !== setDataPromise) {
                throw new Error('Prevented by another setData()');
            }
        };
        const setDataPromise = Promise.resolve(data)
            .then((data) => {
                checkIsNotPrevented();

                return this.prepare(data, dataExtension.methods) || data;
            })
            .then((data) => {
                checkIsNotPrevented();

                this.data = data;
                this.context = context;
                dataExtension.apply(this);

                this.emit('data');
                console.log(`[Discovery] Data prepared in ${Date.now() - startTime}ms`);
            });

        // mark as last setData promise
        lastSetDataPromise.set(this, setDataPromise);

        // run after data is prepared and set
        setDataPromise.then(() => {
            this.scheduleRender('sidebar');
            this.scheduleRender('page');
        });

        return setDataPromise;
    }

    // TODO: remove
    addEntityResolver() {
        console.error('[Discovery] "Widget#addEntityResolver()" method was removed, use "defineObjectMarker()" instead, i.e. setPrepare((data, { defineObjectMarker }) => objects.forEach(defineObjectMarker(...)))');
    }

    // TODO: remove
    addValueLinkResolver() {
        console.error('[Discovery] "Widget#addValueLinkResolver()" method was removed, use "defineObjectMarker()" with "page" option instead, i.e. setPrepare((data, { defineObjectMarker }) => objects.forEach(defineObjectMarker("marker-name", { ..., page: "page-name" })))');
    }

    resolveValueLinks(value) {
        const result = [];
        const type = typeof value;

        if (value && (type === 'object' || type === 'string')) {
            for (const resolver of this.linkResolvers) {
                const link = resolver(value);

                if (link) {
                    result.push(link);
                }
            }
        }

        return result.length ? result : null;
    }

    //
    // Data query
    //

    query(query, data, context) {
        switch (typeof query) {
            case 'function':
                return query(data, context);

            case 'string':
                return jora(query, { methods: this.queryExtensions })(data, context);

            default:
                return query;
        }
    }

    queryBool(...args) {
        try {
            return jora.buildin.bool(this.query(...args));
        } catch (e) {
            return false;
        }
    }

    querySuggestions(query, offset, data, context) {
        const typeOrder = ['property', 'value', 'method'];
        let suggestions;

        try {
            let stat = lastQuerySuggestionsStat.get(this);

            if (!stat || stat.query !== query || stat.data !== data || stat.context !== context) {
                const options = {
                    methods: this.queryExtensions,
                    tolerant: true,
                    stat: true
                };

                lastQuerySuggestionsStat.set(this, stat = { query, data, context, suggestion() {} });
                Object.assign(stat, jora(query, options)(data, context));
            }

            suggestions = stat.suggestion(offset);

            if (suggestions) {
                return suggestions
                    .filter(item =>
                        item.value !== item.current && fuzzyStringCompare(item.current, item.value)
                    )
                    .sort((a, b) => {
                        const at = typeOrder.indexOf(a.type);
                        const bt = typeOrder.indexOf(b.type);

                        return at - bt || (a.value < b.value ? -1 : 1);
                    });
            }
        } catch (e) {
            console.groupCollapsed('[Discovery] Error on getting suggestions for query');
            console.error(e);
            console.groupEnd();
            return;
        }
    }

    getQueryEngineInfo() {
        return {
            name: 'jora',
            version: jora.version,
            link: 'https://github.com/discoveryjs/jora'
        };
    }

    // TODO: remove
    addQueryHelpers() {
        console.error('[Discovery] "Widget#addQueryHelpers()" method was removed, use "addQueryHelpers()" instead, i.e. setPrepare((data, { addQueryHelpers }) => addQueryHelpers(...))');
    }

    //
    // UI
    //

    setContainer(container) {
        const newContainerEl = container || null;
        const oldDomRefs = this.dom;

        if (this.dom.container === newContainerEl) {
            return;
        }

        // reset old refs
        this.dom = {};

        if (newContainerEl !== null) {
            this.dom.container = newContainerEl;
            this.initContainer(newContainerEl, this.dom);
        }

        this.emit('container-changed', this.dom, oldDomRefs);
    }

    initContainer(container, refs) {
        container.classList.add('discovery', this.isolateStyleMarker);
        container.dataset.discoveryInstanceId = this.instanceId;

        container.appendChild(
            refs.content = createElement('main', 'discovery-content')
        );
    }

    addGlobalEventListener(eventName, handler, options) {
        const instanceId = this.instanceId;
        const handlerWrapper = function(event) {
            const root = event.target !== document
                ? event.target.closest('[data-discovery-instance-id]')
                : null;

            if (root && root.dataset.discoveryInstanceId === instanceId) {
                handler.call(this, event);
            }
        };

        document.addEventListener(eventName, handlerWrapper, options);
        return () => document.removeEventListener(eventName, handlerWrapper, options);
    }

    render(config) {
        this.view.render(this.dom.container, config, this.data, this.context);
    }
}
