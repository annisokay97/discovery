import { escapeHtml } from '../../core/utils/html.js';
import { jsonStringifyInfo } from '../../core/utils/json.js';
import copyText from '../../core/utils/copy-text.js';

function formatSize(size) {
    if (!size) {
        return '';
    }

    return ', ' + String(size).replace(/\B(?=(\d{3})+$)/g, '<span class="num-delim"></span>') + ' bytes';
}

export default function(discovery, elementData, buildPathForElement) {
    return new discovery.view.Popup({
        className: 'view-struct-actions-popup',
        render: (popupEl, triggerEl, hide) => {
            const el = triggerEl.parentNode;
            const data = elementData.get(el);
            let actions = [];

            if (typeof data === 'string') {
                actions = [
                    {
                        text: 'Copy as quoted string',
                        action: () => copyText(JSON.stringify(data))
                    },
                    {
                        text: 'Copy as unquoted string',
                        action: () => copyText(JSON.stringify(data).slice(1, -1))
                    },
                    {
                        text: 'Copy a value (unescaped)',
                        action: () => copyText(data)
                    }
                ];
            } else {
                const path = discovery.pathToQuery(buildPathForElement(el));
                const maxAllowedSize = 1024 * 1024 * 1024;
                const { minLength: compactSize, circular } = jsonStringifyInfo(data);
                let jsonFormattedStringifyError = false;
                let jsonCompactStringifyError = false;
                let formattedSize = 0;

                if (circular.length) {
                    jsonCompactStringifyError = 'Can\'t be copied: Converting circular structure to JSON';
                    jsonFormattedStringifyError = jsonCompactStringifyError;
                } else if (compactSize > maxAllowedSize) {
                    jsonCompactStringifyError = 'Can\'t be copied: Resulting JSON is over 1 Gb';
                    jsonFormattedStringifyError = jsonCompactStringifyError;
                } else {
                    formattedSize = jsonStringifyInfo(data, null, 4).minLength;
                    if (formattedSize > maxAllowedSize) {
                        jsonFormattedStringifyError = 'Can\'t be copied: Resulting JSON is over 1 Gb';
                    }
                }

                if (path) {
                    actions.push({
                        text: 'Copy path:',
                        notes: escapeHtml(path),
                        action: () => copyText(path)
                    });
                }

                actions.push({
                    text: 'Copy as JSON',
                    notes: `(formatted${formatSize(formattedSize)})`,
                    error: jsonFormattedStringifyError,
                    disabled: Boolean(jsonFormattedStringifyError),
                    action: () => copyText(JSON.stringify(data, null, 4))
                });
                actions.push({
                    text: 'Copy as JSON',
                    notes: `(compact${jsonCompactStringifyError ? '' : formatSize(compactSize)})`,
                    error: jsonCompactStringifyError,
                    disabled: Boolean(jsonCompactStringifyError),
                    action: () => copyText(JSON.stringify(data))
                });
            }

            discovery.view.render(popupEl, {
                view: 'menu',
                onClick(item) {
                    hide();
                    item.action();
                },
                item: [
                    'html:text',
                    {
                        view: 'block',
                        when: 'notes',
                        className: 'notes',
                        content: 'html:notes'
                    },
                    {
                        view: 'block',
                        when: 'error',
                        className: 'error',
                        content: 'text:error'
                    }
                ]
            }, actions);
        }
    });
}
