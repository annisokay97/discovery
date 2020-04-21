/* eslint-env browser */

import Emitter from '../core/emitter.js';
import ViewRenderer from '../core/view.js';
import PresetRenderer from '../core/preset.js';
import PageRenderer from '../core/page.js';
import TypeResolver from '../core/type-resolver.js';
import * as views from '../views/index.js';
import * as pages from '../pages/index.js';
import { createElement } from '../core/utils/dom.js';
import jora from '/gen/jora.js'; // FIXME: generated file to make it local

const lastSetDataPromise = new WeakMap();
const lastQuerySuggestionsStat = new WeakMap();
const renderScheduler = new WeakMap();

function defaultEncodeParams(params) {
    return new URLSearchParams(params).toString();
}

function defaultDecodeParams(value) {
    return value;
}

function setDatasetValue(el, key, value) {
    if (value) {
        el.dataset[key] = true;
    } else {
        delete el.dataset[key];
    }
}

function getPageMethod(instance, pageId, name, fallback) {
    const page = instance.page.get(pageId);

    return page && typeof page.options[name] === 'function'
        ? page.options[name]
        : fallback;
}

function genUniqueId(len = 16) {
    const base36 = val => Math.round(val).toString(36);
    let uid = base36(10 + 25 * Math.random()); // uid should starts with alpha

    while (uid.length < len) {
        uid += base36(new Date * Math.random());
    }

    return uid.substr(0, len);
}

function equal(a, b) {
    if (a === b) {
        return true;
    }

    for (let key in a) {
        if (hasOwnProperty.call(a, key)) {
            if (!hasOwnProperty.call(b, key) || a[key] !== b[key]) {
                return false;
            }
        }
    }

    for (let key in b) {
        if (hasOwnProperty.call(b, key)) {
            if (!hasOwnProperty.call(a, key) || a[key] !== b[key]) {
                return false;
            }
        }
    }

    return true;
}

function fuzzyStringCmp(a, b) {
    const startChar = a[0];
    const lastChar = a[a.length - 1];
    const start = startChar === '"' || startChar === "'" ? 1 : 0;
    const end = lastChar === '"' || lastChar === "'" ? 1 : 0;

    return b.toLowerCase().indexOf(a.toLowerCase().substring(start, a.length - end), b[0] === '"' || b[0] === "'") !== -1;
}

function createDataExtensionApi(instance) {
    const entityResolvers = new TypeResolver();
    // const linkResolvers = new X(instance.pageLinkResolvers, entityResolvers);
    const annotations = [];
    const queryExtensions = {
        query: (...args) => instance.query(...args),
        pageLink: (pageRef, pageId, pageParams) =>
            instance.encodePageHash(pageId, pageRef, pageParams),
        autolink(current, type) {
            if (current && typeof current.autolink === 'function') {
                return current.autolink();
            }

            const descriptor = entityResolvers.resolve(current, type);

            if (descriptor && typeof descriptor.link === 'function') {
                return descriptor.link(current);
            }
        }
    };

    return {
        apply() {
            Object.assign(instance, {
                entityResolvers,
                annotations,
                queryExtensions
            });
        },
        methods: {
            addEntityResolver(name, values, options) {
                const resolver = entityResolvers.define(name, values, options);
                const pageId = options && options.page;

                if (options && options.page) {
                    if (!instance.page.isDefined(options.page)) {
                        console.error(`[Discovery] Page reference "${options.page}" doesn't exist`);
                        return;
                    }

                    annotations.push({
                        place: 'before',
                        type: 'link',
                        className: 'view-struct-auto-link',
                        data: (value, context) => {
                            const entity = resolver(value);

                            if (entity && entity.value !== context.host) {
                                return {
                                    text: pageId,
                                    href: instance.encodePageHash(pageId, entity.id)
                                };
                            }
                        }
                    });
                }
                // annotations.push({
                //     place: 'before',
                //     type: 'icon',
                //     data: value =>
                //         typeof value === 'string' ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48cGF0aCBkPSJNODQuNyAzOS4xbC0zNy4zIDY0LjRjLTMuMSA1LjQtNy40IDEwLTEyLjYgMTMuNEwyNCAxMjRsLjgtMTIuOWMuNC02LjIgMi4yLTEyLjIgNS4zLTE3LjZsMzcuMy02NC40IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTYwLjQgNDQuMWMtLjUgMC0xLS4xLTEuNS0uNC0xLjQtLjgtMS45LTIuNy0xLjEtNC4xbDctMTJjLjgtMS40IDIuNy0xLjkgNC4xLTEuMXMxLjkgMi43IDEuMSA0LjFsLTcgMTJjLS42LjktMS42IDEuNS0yLjYgMS41ek03Ny43IDU0LjFjLS41IDAtMS0uMS0xLjUtLjQtMS40LS44LTEuOS0yLjctMS4xLTQuMWw3LTEyYy44LTEuNCAyLjctMS45IDQuMS0xLjEgMS40LjggMS45IDIuNyAxLjEgNC4xbC03IDEyYy0uNi45LTEuNiAxLjUtMi42IDEuNXoiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNNDcuMiA5NC44Yy0uNSAwLTEtLjEtMS41LS40LTEuNC0uOC0xLjktMi43LTEuMS00LjFsMjUtNDMuNGMuOC0xLjQgMi42LTEuOCA0LjEtMS4xbDUuNiAyLjctMjkuNCA0NC45Yy0uNiAxLTEuNyAxLjQtMi43IDEuNHoiIGZpbGw9IiNmY2NhM2QiLz48cGF0aCBmaWxsPSIjODg4IiBzdHJva2U9IiM4ODgiIHN0cm9rZS13aWR0aD0iLjUiIGQ9Ik0yNCAxMjdjLS41IDAtMS0uMS0xLjUtLjQtMS0uNi0xLjYtMS42LTEuNS0yLjhsLjgtMTIuOWMuNC02LjYgMi40LTEzLjIgNS43LTE4LjlsMzAuMy01Mi40Yy44LTEuNCAyLjctMS45IDQuMS0xLjEgMS40LjggMS45IDIuNyAxLjEgNC4xTDMyLjcgOTVjLTIuOSA0LjktNC41IDEwLjYtNC45IDE2LjNsLS40IDYuOSA1LjgtMy44QzM4IDExMS4zIDQyIDEwNyA0NC45IDEwMmwzMC4zLTUyLjRjLjgtMS40IDIuNy0xLjkgNC4xLTEuMSAxLjQuOCAxLjkgMi43IDEuMSA0LjFMNTAgMTA1Yy0zLjMgNS44LTggMTAuNy0xMy41IDE0LjRsLTEwLjggNy4xYy0uNS4zLTEuMS41LTEuNy41ek04OSAxMjdINDljLTEuNyAwLTMtMS4zLTMtM3MxLjMtMyAzLTNoNDBjMS43IDAgMyAxLjMgMyAzcy0xLjMgMy0zIDN6Ii8+PGNpcmNsZSBmaWxsPSIjODg4IiBzdHJva2U9IiM4ODgiIHN0cm9rZS13aWR0aD0iLjUiIGN4PSIxMDQiIGN5PSIxMjQiIHI9IjMiLz48cGF0aCBkPSJNODcuNyAzNi43Yy0uNSAwLTEtLjEtMS41LS40LTEuNC0uOC0xLjktMi43LTEuMS00LjEuOS0xLjYgMS4yLTMuNS43LTUuM3MtMS42LTMuMy0zLjMtNC4yYy0xLjYtLjktMy41LTEuMi01LjMtLjdzLTMuMyAxLjYtNC4zIDMuM2MtLjggMS40LTIuNyAxLjktNC4xIDEuMXMtMS45LTIuNy0xLjEtNC4xYzMuNi02LjIgMTEuNi04LjMgMTcuOC00LjggMyAxLjcgNS4yIDQuNSA2LjEgNy45cy40IDYuOS0xLjMgOS45Yy0uNi45LTEuNiAxLjQtMi42IDEuNHoiIGZpbGw9IiNmZjU1NzYiLz48cGF0aCBkPSJNODcuNyAzMy43YzIuOC00LjggMS4xLTEwLjktMy43LTEzLjctNC44LTIuOC0xMC45LTEuMS0xMy43IDMuN2wtMy43IDYuNSAxNy4zIDEwIDMuOC02LjV6IiBmaWxsPSIjZmY1NTc2Ii8+PHBhdGggZD0iTTgzLjkgNDMuMmMtLjUgMC0xLS4xLTEuNS0uNGwtMTcuMy0xMGMtLjctLjQtMS4yLTEuMS0xLjQtMS44LS4yLS44LS4xLTEuNi4zLTIuM2wzLjctNi41YzMuNi02LjIgMTEuNi04LjMgMTcuOC00LjggMyAxLjcgNS4yIDQuNSA2LjEgNy45cy40IDYuOS0xLjMgOS45bC0zLjcgNi41Yy0uNC43LTEuMSAxLjItMS44IDEuNC0uNC4xLS42LjEtLjkuMXpNNzAuNyAyOS4xbDEyLjEgNyAyLjItMy45Yy45LTEuNiAxLjItMy41LjctNS4zcy0xLjYtMy4zLTMuMy00LjJjLTMuMy0xLjktNy42LS44LTkuNiAyLjZsLTIuMSAzLjh6IiBmaWxsPSIjZmY1NTc2Ii8+PHBhdGggZD0iTTgzLjkgNDMuMmMtLjUgMC0xLS4xLTEuNS0uNC0xLjQtLjgtMS45LTIuNy0xLjEtNC4xbDMuNy02LjVjMS0xLjggMS4yLTQgLjUtNi0uNi0xLjYuMi0zLjMgMS44LTMuOSAxLjYtLjYgMy4zLjIgMy45IDEuOCAxLjQgMy43IDEgNy43LS45IDExLjFsLTMuNyA2LjVjLS42IDEtMS42IDEuNS0yLjcgMS41eiIgZmlsbD0iI2QzMmY1NiIvPjwvc3ZnPg==' : ''
                // });
            },
            addValueAnnotation(config) {
                annotations.push(config);
            },
            addQueryHelpers(helpers) {
                Object.assign(queryExtensions, helpers);
            }
        }
    };
}

export default class Widget extends Emitter {
    constructor(container, defaultPage, options) {
        super();

        this.options = options || {};
        this.view = new ViewRenderer(this);
        this.preset = new PresetRenderer(this.view);
        this.page = new PageRenderer(this.view);

        this.prepare = data => data;
        this.entityResolvers = [];
        this.linkResolvers = [];
        this.annotations = [];
        this.queryExtensions = {
            query: (...args) => this.query(...args),
            pageLink: (pageRef, pageId, pageParams) =>
                this.encodePageHash(pageId, pageRef, pageParams)
        };

        this.defaultPageId = this.options.defaultPageId || 'default';
        this.pageId = this.defaultPageId;
        this.pageRef = null;
        this.pageParams = {};
        this.pageHash = this.encodePageHash(this.pageId, this.pageRef, this.pageParams);
        this.scheduledRenderPage = null;

        this.instanceId = genUniqueId();
        this.isolateStyleMarker = this.options.isolateStyleMarker || 'style-boundary-8H37xEyN';
        this.badges = [];
        this.dom = {};

        this.apply(views);
        this.apply(pages);

        if (defaultPage) {
            this.page.define('default', defaultPage);
        }

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
        const setDataPromise = Promise
            .resolve(this.prepare(data, dataExtension.methods) || data)
            .then(() => {  // TODO: use prepare ret
                const lastPromise = lastSetDataPromise.get(this);

                // prevent race conditions, perform only this promise was last one
                if (lastPromise !== setDataPromise) {
                    throw new Error('Prevented by another setData()');
                }

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
        console.error('[Discovery] Widget#addEntityResolver() is removed, use extenstion API in prepare instead, i.e. setPrepare((data, { addEntityResolver }) => ...)');
    }

    resolveEntity(value) {
        for (let i = 0; i < this.entityResolvers.length; i++) {
            const entity = this.entityResolvers[i](value);

            if (entity) {
                return entity;
            }
        }
    }

    addValueLinkResolver(resolver) {
        if (typeof resolver === 'function') {
            this.linkResolvers.push(resolver);
        }
    }

    resolveValueLinks(value) {
        const result = [];
        const type = typeof value;

        if (value && (type === 'object' || type === 'string')) {
            const entity = this.resolveEntity(value);

            for (let i = 0; i < this.linkResolvers.length; i++) {
                const link = this.linkResolvers[i](entity, value, this.data, this.context);

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

                lastQuerySuggestionsStat.set(this, stat = Object.assign(
                    jora(query, options)(data, context),
                    { query, data, context }
                ));
            }

            suggestions = stat.suggestion(offset);

            if (suggestions) {
                return suggestions
                    .filter(
                        item => item.value !== item.current && fuzzyStringCmp(item.current, item.value)
                    )
                    .sort((a, b) => {
                        const at = typeOrder.indexOf(a.type);
                        const bt = typeOrder.indexOf(b.type);
                        return at - bt || (a.value < b.value ? -1 : 1);
                    });
            }
        } catch (e) {
            console.error(e);
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
    addQueryHelpers(extensions) {
        console.warn('[Discovery] Widget#addQueryHelpers() is deprecated, use extenstion API in prepare instead');
        this._extensitionApi.addQueryHelpers(extensions);
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

            newContainerEl.classList.add('discovery', this.isolateStyleMarker);
            newContainerEl.dataset.discoveryInstanceId = this.instanceId;

            newContainerEl.appendChild(
                this.dom.sidebar = createElement('nav', 'discovery-sidebar')
            );

            newContainerEl.appendChild(
                createElement('main', 'discovery-content', [
                    this.dom.badges = createElement('div', 'discovery-content-badges'),
                    this.dom.pageContent = createElement('article')
                ])
            );

            this.badges.forEach(badge =>
                this.dom.badges.appendChild(badge.el)
            );
        }

        this.emit('container-changed', this.dom, oldDomRefs);
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

    addBadge(caption, action, visible) {
        const badge = {
            el: document.createElement('div'),
            visible: typeof visible === 'function' ? visible : () => true
        };

        badge.el.className = 'badge';
        badge.el.addEventListener('click', action);
        badge.el.hidden = !badge.visible(this);

        if (typeof caption === 'function') {
            caption(badge.el);
        } else {
            badge.el.innerHTML = caption;
        }

        if (this.dom.badges) {
            this.dom.badges.appendChild(badge.el);
        }

        this.badges.push(badge);

        return badge;
    }

    //
    // Render common
    //

    scheduleRender(subject) {
        if (!renderScheduler.has(this)) {
            const subjects = new Set();

            renderScheduler.set(this, subjects);
            Promise.resolve().then(() => {
                renderScheduler.delete(this);

                if (subjects.has('sidebar')) {
                    this.renderSidebar();
                }

                if (subjects.has('page')) {
                    this.renderPage();
                }
            });
        }

        renderScheduler.get(this).add(subject);
    }

    cancelScheduledRender(subject) {
        const sheduledRenders = renderScheduler.get(this);

        if (sheduledRenders) {
            if (subject) {
                sheduledRenders.delete(subject);
            } else {
                sheduledRenders.clear();
            }
        }
    }

    getRenderContext() {
        return {
            page: this.pageId,
            id: this.pageRef,
            params: this.pageParams,
            ...this.context
        };
    }

    //
    // Sidebar
    //

    renderSidebar() {
        // cancel scheduled renderSidebar
        if (renderScheduler.has(this)) {
            renderScheduler.get(this).delete('sidebar');
        }

        if (this.view.isDefined('sidebar')) {
            const renderStartTime = Date.now();

            this.dom.sidebar.innerHTML = '';
            this.view.render(
                this.dom.sidebar,
                'sidebar',
                this.data,
                this.getRenderContext()
            ).then(() => console.log(`[Discovery] Sidebar rendered in ${Date.now() - renderStartTime}ms`));
        }
    }

    //
    // Page
    //

    encodePageHash(pageId, pageRef, pageParams) {
        const encodeParams = getPageMethod(this, pageId, 'encodeParams', defaultEncodeParams);
        const encodedParams = encodeParams(pageParams || {});

        return `#${
            pageId !== this.defaultPageId ? escape(pageId) : ''
        }${
            (typeof pageRef === 'string' && pageRef) || (typeof pageRef === 'number') ? ':' + escape(pageRef) : ''
        }${
            encodedParams ? '&' + encodedParams : ''
        }`;
    }

    decodePageHash(hash) {
        const parts = hash.substr(1).split('&');
        const [pageId, pageRef] = (parts.shift() || '').split(':').map(unescape);
        const decodeParams = getPageMethod(this, pageId || this.defaultPageId, 'decodeParams', defaultDecodeParams);
        const pageParams = decodeParams([...new URLSearchParams(parts.join('&'))].reduce((map, [key, value]) => {
            map[key] = value || true;
            return map;
        }, {}));

        return {
            pageId: pageId || this.defaultPageId,
            pageRef,
            pageParams
        };
    }

    getPageOption(name, fallback) {
        const page = this.page.get(this.pageId);

        return page && name in page.options ? page.options[name] : fallback;
    }

    setPage(pageId, pageRef, pageParams, replace = false) {
        return this.setPageHash(
            this.encodePageHash(pageId || this.defaultPageId, pageRef, pageParams),
            replace
        );
    }

    setPageParams(pageParams, replace = false) {
        return this.setPageHash(
            this.encodePageHash(this.pageId, this.pageRef, pageParams),
            replace
        );
    }

    setPageHash(hash, replace = false) {
        if (hash !== this.pageHash) {
            const { pageId, pageRef, pageParams } = this.decodePageHash(hash);
            const changed =
                this.pageId !== pageId ||
                this.pageRef !== pageRef ||
                !equal(this.pageParams, pageParams);

            this.pageHash = hash;

            if (changed) {
                this.pageId = pageId;
                this.pageRef = pageRef;
                this.pageParams = pageParams;
                this.scheduleRender('page');
                this.emit('pageHashChange', replace);
            }

            return changed;
        }

        return false;
    }

    renderPage() {
        // cancel scheduled renderPage
        if (renderScheduler.has(this)) {
            renderScheduler.get(this).delete('page');
        }

        const { pageEl, renderState } = this.page.render(
            this.dom.pageContent,
            this.pageId,
            this.data,
            this.getRenderContext()
        );

        this.dom.pageContent = pageEl;
        this.badges.forEach(badge => badge.el.hidden = !badge.visible(this));

        setDatasetValue(this.dom.container, 'dzen', this.pageParams.dzen);
        setDatasetValue(this.dom.container, 'compact', this.options.compact);

        return renderState;
    }
}
