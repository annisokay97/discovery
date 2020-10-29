/* eslint-env browser */

import value2html from './value-to-html.js';
import { matchAll } from '../../core/utils/pattern.js';
import createClickHandler from './click-handler.js';
import createAnnotationRenderer from './render-annotations.js';
import createValueActionsPopup from './popup-value-actions.js';
import createSignaturePopup from './popup-signature.js';
import usage from './struct.usage.js';
import {
    patternMatchProto,
    stringValueProto,
    arrayValueProto,
    objectValueProto,
    entryProtoEl,
    valueProtoEl,
    objectKeyProtoEl
} from './el-proto.js';

const hasOwnProperty = Object.prototype.hasOwnProperty;
const toString = Object.prototype.toString;
const defaultExpandedItemsLimit = 50;
const defaultCollapsedItemsLimit = 4;
const maxStringLength = 150;
const maxLinearStringLength = 50;

function isValueExpandable(value) {
    // array
    if (Array.isArray(value)) {
        return value.length > 0;
    }

    // string
    if (typeof value === 'string' && (value.length > maxStringLength || /[\r\n\f\t]/.test(value))) {
        return true;
    }

    // plain object
    if (value && toString.call(value) === '[object Object]') {
        for (const key in value) {
            if (hasOwnProperty.call(value, key)) {
                return true;
            }
        }
    }

    return false;
}

function appendText(el, text) {
    el.appendChild(document.createTextNode(text));
}

function renderValueSize(el, entries, unit) {
    if (entries.length > 1) {
        appendText(el.lastElementChild, entries.length + ' ' + unit);
    }
}

function renderSorting(el, entries, sort) {
    let sorted = entries.length <= 1 || entries.every(([key], idx) => idx === 0 || key > entries[idx - 1][0]);

    if (sorted) {
        el.querySelector('[data-action="toggle-sort-keys"]').remove();
    } else if (sort) {
        entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    }
}

function renderObjectKey(container, name, options) {
    const { match } = options;
    const objectKeyEl = objectKeyProtoEl.cloneNode(true);

    if (match) {
        matchAll(
            name,
            match,
            text => objectKeyEl.firstElementChild
                .appendChild(document.createTextNode(text)),
            text => objectKeyEl.firstElementChild
                .appendChild(patternMatchProto.cloneNode())
                .appendChild(document.createTextNode(text))
        );
    } else {
        appendText(objectKeyEl.firstElementChild, name);
    }

    container.appendChild(objectKeyEl);
}

export default function(discovery) {
    function collapseValue(el) {
        const options = elementOptions.get(el);
        const data = elementData.get(el);

        el.classList.add('struct-expand-value');
        el.innerHTML = value2html(data, false, options);
    }

    function expandValue(el, autoExpandLimit, sort) {
        const data = elementData.get(el);

        el.classList.remove('struct-expand-value');

        // at this point we assume that a data is a string, an array or an object,
        // since only such types of data expandable
        if (typeof data === 'string') {
            // string
            const valueEl = stringValueProto.cloneNode(true);
            const stringValueEl = valueEl.lastChild.previousSibling;
            const text = JSON.stringify(data);

            appendText(stringValueEl.firstChild, text.slice(1, -1));
            appendText(stringValueEl.previousSibling, `length: ${text.length} chars`);

            el.innerHTML = '';
            el.appendChild(valueEl);
        } else if (Array.isArray(data)) {
            // array
            const context = elementContext.get(el);
            const options = elementOptions.get(el);
            const entries = Object.entries(data);

            el.innerHTML = '';
            el.appendChild(arrayValueProto.cloneNode(true));

            renderValueSize(el, entries, 'elements');
            renderEntries(el, el.lastChild, options, entries, (entryEl, [key, value], index) => {
                renderValue(entryEl, value, autoExpandLimit, options, Object.freeze({
                    parent: context,
                    host: data,
                    key,
                    index
                }));
            });
        } else {
            // object
            const context = elementContext.get(el);
            const options = elementOptions.get(el);
            const entries = Object.entries(data);

            el.innerHTML = '';
            el.appendChild(objectValueProto.cloneNode(true));

            renderValueSize(el, entries, 'entries');
            renderSorting(el, entries, sort);
            renderEntries(el, el.lastChild, options, entries, (entryEl, [key, value], index) => {
                renderObjectKey(entryEl, key, options);
                renderValue(entryEl, value, autoExpandLimit, options, Object.freeze({
                    parent: context,
                    host: data,
                    key,
                    index
                }));
            });
        }
    }

    function renderValue(container, value, autoExpandLimit, options, context) {
        const expandable = isValueExpandable(value);
        const valueEl = valueProtoEl.cloneNode(true);

        elementData.set(valueEl, value);
        elementContext.set(valueEl, context);
        elementOptions.set(valueEl, options);

        if (expandable && typeof value !== 'string' && autoExpandLimit) {
            // expanded
            container.classList.add('struct-expanded-value');
            expandValue(valueEl, autoExpandLimit - 1);
        } else {
            // collapsed
            if (expandable) {
                valueEl.classList.add('struct-expand-value');
            }

            valueEl.innerHTML = value2html(value, false, options);
        }

        annotationRenderer.apply(valueEl, value, options, context);
        container.appendChild(valueEl);
    }

    function renderEntries(container, beforeEl, options, entries, renderEntryContent, offset = 0) {
        const { limit } = options;
        const lastIndex = entries.length - offset - 1;
        const buffer = document.createDocumentFragment();

        if (limit === false) {
            limit = entries.length;
        }

        entries
            .slice(offset, offset + limit)
            .forEach((entry, index) => {
                const el = entryProtoEl.cloneNode(true);

                renderEntryContent(el, entry, offset + index);
                if (index !== lastIndex) {
                    appendText(el, ',');
                }

                buffer.appendChild(el);
            });

        container.insertBefore(buffer, beforeEl);

        discovery.view.maybeMoreButtons(
            container,
            beforeEl,
            entries.length,
            offset + limit,
            limit,
            offset => renderEntries(container, beforeEl, options, entries, renderEntryContent, offset)
        );
    }

    function buildPathForElement(el) {
        let path = [];
        let context = elementContext.get(el);

        while (context !== null && context.parent !== null) {
            path.unshift(context.key);
            context = context.parent;
        }

        return path;
    }

    const elementData = new WeakMap();
    const elementContext = new WeakMap();
    const elementOptions = new WeakMap();
    const structViewRoots = new WeakSet();

    const annotationRenderer = createAnnotationRenderer(discovery);
    const valueActionsPopup = createValueActionsPopup(discovery, elementData, buildPathForElement);
    const signaturePopup = createSignaturePopup(discovery, elementData, buildPathForElement);
    const clickHandler = createClickHandler(
        expandValue,
        collapseValue,
        structViewRoots,
        annotationRenderer,
        valueActionsPopup,
        signaturePopup
    );

    // single event handler for all `struct` view instances
    discovery.addGlobalEventListener('click', clickHandler, false);

    discovery.view.define('struct', function(el, config, data) {
        const { expanded, limit, limitCollapsed, annotations, match } = config; // FIXME: add limit option
        const expandable = isValueExpandable(data);
        const options = {
            limitCollapsed: discovery.view.listLimit(limitCollapsed, defaultCollapsedItemsLimit),
            limit: discovery.view.listLimit(limit, defaultExpandedItemsLimit),
            annotations: discovery.annotations.concat(annotations || []),
            maxStringLength,
            maxLinearStringLength,
            match
        };

        structViewRoots.add(el);
        renderValue(el, data, expanded, options, {
            parent: null,
            host: { '': data },
            key: '',
            index: 0
        });
        annotationRenderer.scheduleRender();

        if (expandable && !expanded) {
            el.classList.add('struct-expand');
        }
    }, {
        usage
    });

    // FIXME: this function never call
    return () => {
        document.removeEventListener('click', clickHandler, false);
    };
}
