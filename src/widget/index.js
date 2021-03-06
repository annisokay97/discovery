/* eslint-env browser */

import Emitter from '../core/emitter.js';
import ViewRenderer from '../core/view.js';
import PresetRenderer from '../core/preset.js';
import PageRenderer from '../core/page.js';
import ObjectMarker from '../core/object-marker.js';
import Publisher from '../core/publisher.js';
import * as views from '../views/index.js';
import * as pages from '../pages/index.js';
import { createElement } from '../core/utils/dom.js';
import attachViewInspector from '../inspector/index.js';
import { equal, fuzzyStringCompare } from '../core/utils/compare.js';
import { DarkModeController } from './darkmode.js';
import { WidgetNavigation } from './nav.js';
import * as lib from '../lib.js';
import jora from '/gen/jora.js'; // FIXME: generated file to make it local

const lastSetDataPromise = new WeakMap();
const lastQuerySuggestionsStat = new WeakMap();
const renderScheduler = new WeakMap();

const defaultEncodeParams = (params) => params;
const defaultDecodeParams = (pairs) => Object.fromEntries(pairs);

function setDatasetValue(el, key, value) {
    if (value) {
        el.dataset[key] = true;
    } else {
        delete el.dataset[key];
    }
}

function getPageOption(host, pageId, name, fallback) {
    const page = host.page.get(pageId);

    return page && Object.hasOwnProperty.call(page.options, name)
        ? page.options[name]
        : fallback;
}

function getPageMethod(host, pageId, name, fallback) {
    const method = getPageOption(host, pageId, name, fallback);

    return typeof method === 'function'
        ? method
        : fallback;
}

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
    const lookupObjectMarker = (value, type) => objectMarkers.lookup(value, type);
    const lookupObjectMarkerAll = (value) => objectMarkers.lookupAll(value);
    const queryCustomMethods = {
        query: (...args) => instance.query(...args),
        pageLink: (pageRef, pageId, pageParams) =>
            instance.encodePageHash(pageId, pageRef, pageParams),
        marker: lookupObjectMarker,
        markerAll: lookupObjectMarkerAll
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
                queryFnFromString: jora.setup(queryCustomMethods)
            });
        },
        methods: {
            lookupObjectMarker,
            lookupObjectMarkerAll,
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
                Object.assign(queryCustomMethods, helpers);
            }
        }
    };
}

export default class Widget extends Emitter {
    constructor(container, defaultPage, options) {
        super();

        this.lib = lib; // FIXME: temporary solution to expose discovery's lib API

        this.options = options || {};
        this.view = new ViewRenderer(this);
        this.nav = new WidgetNavigation(this);
        this.preset = new PresetRenderer(this.view);
        this.page = new PageRenderer(this);
        this.page.on('define', (pageId, page) => {
            const { resolveLink } = page.options;

            if (typeof resolveLink !== 'undefined') {
                console.warn('"resolveLink" in "page.define()" options is deprecated, use "page" option for "defineObjectMarker()" method in prepare function');
            }

            // FIXME: temporary solution to avoid missed custom page's `decodeParams` method call on initial render
            if (this.pageId === pageId && this.pageHash !== '#') {
                const hash = this.pageHash;
                this.pageHash = '#';
                this.setPageHash(hash);
                this.cancelScheduledRender();
            }
        });
        renderScheduler.set(this, new Set());

        this.prepare = data => data;
        createDataExtensionApi(this).apply();

        this.defaultPageId = this.options.defaultPageId || 'default';
        this.reportPageId = this.options.reportPageId || 'report';
        this.pageId = this.defaultPageId;
        this.pageRef = null;
        this.pageParams = {};
        this.pageHash = this.encodePageHash(this.pageId, this.pageRef, this.pageParams);

        const {
            darkmode = 'disabled',
            darkmodePersistent = false
        } = this.options;
        this.darkmode = new DarkModeController(darkmode, darkmodePersistent);

        this.instanceId = genUniqueId();
        this.isolateStyleMarker = this.options.isolateStyleMarker || 'style-boundary-8H37xEyN';
        this.inspectMode = new Publisher(false);
        this.dom = {};

        this.apply(views);
        this.apply(pages);

        if (defaultPage) {
            this.page.define(this.defaultPageId, defaultPage);
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
                dataExtension.apply();

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

    queryFn(query) {
        switch (typeof query) {
            case 'function':
                return query;

            case 'string':
                return this.queryFnFromString(query);
        }
    }

    query(query, data, context) {
        switch (typeof query) {
            case 'function':
                return query(data, context);

            case 'string':
                return this.queryFn(query)(data, context);

            default:
                return query;
        }
    }

    queryBool(...args) {
        return jora.buildin.bool(this.query(...args));
    }

    queryToConfig(view, query) {
        const { ast } = jora.syntax.parse(query);
        const config = { view };

        if (ast.type !== 'Block') {
            throw new SyntaxError('[Discovery] Widget#queryToConfig(): query root must be a "Block"');
        }

        if (ast.body.type !== 'Object') {
            throw new SyntaxError('[Discovery] Widget#queryToConfig(): query root must return an "Object"');
        }

        for (const entry of ast.body.properties) {
            if (entry.type !== 'ObjectEntry') {
                throw new SyntaxError('[Discovery] Widget#queryToConfig(): unsupported object entry type "' + entry.type + '"');
            }

            let key;
            switch (entry.key.type) {
                case 'Literal':
                    key = entry.key.value;
                    break;

                case 'Identifier':
                    key = entry.key.name;
                    entry.value = entry.value || entry.key;
                    break;

                case 'Reference':
                    key = entry.key.name.name;
                    entry.value = entry.value || entry.key;
                    break;

                default:
                    throw new SyntaxError('[Discovery] Widget#queryToConfig(): unsupported object key type "' + entry.key.type + '"');
            }

            if (key === 'view' || key === 'postRender' || key === 'className') {
                throw new SyntaxError('[Discovery] Widget#queryToConfig(): set a value for "' + key + '" property via query is prohibited');
            }

            if (key === 'when' || key === 'data' || key === 'whenData') {
                if (entry.value.type === 'Literal') {
                    config[key] = typeof entry.value.value === 'string'
                        ? JSON.stringify(entry.value.value)
                        : entry.value.value;
                } else {
                    config[key] = jora.syntax.stringify(entry.value);
                }
            } else {
                config[key] = entry.value.type === 'Literal' && (typeof entry.value.value !== 'string' || entry.value.value[0] !== '=')
                    ? entry.value.value
                    : '=' + jora.syntax.stringify(entry.value);
            }
        }

        return config;
    }

    querySuggestions(query, offset, data, context) {
        const typeOrder = ['property', 'value', 'method'];
        let suggestions;

        try {
            let stat = lastQuerySuggestionsStat.get(this);

            if (!stat || stat.query !== query || stat.data !== data || stat.context !== context) {
                const options = {
                    tolerant: true,
                    stat: true
                };

                lastQuerySuggestionsStat.set(this, stat = { query, data, context, suggestion() {} });
                Object.assign(stat, this.queryFnFromString(query, options)(data, context));
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

    pathToQuery(path) {
        return path.map((part, idx) =>
            part === '*'
                ? (idx === 0 ? 'values()' : '.values()')
                : typeof part === 'number' || !/^[a-zA-Z_][a-zA-Z_$0-9]*$/.test(part)
                    ? (idx === 0 ? `$[${JSON.stringify(part)}]` : `[${JSON.stringify(part)}]`)
                    : (idx === 0 ? part : '.' + part)
        ).join('');
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

    getDomRoots() {
        return [
            ...document.querySelectorAll(`[data-discovery-instance-id=${JSON.stringify(this.instanceId)}]`)
        ];
    }

    setContainer(container) {
        const newContainerEl = container || null;
        const oldDomRefs = this.dom;

        if (this.dom.container === newContainerEl) {
            return;
        }

        // reset old refs
        this.dom = {};
        if (typeof oldDomRefs.detachDarkMode === 'function') {
            oldDomRefs.detachDarkMode();
        }

        if (newContainerEl !== null) {
            this.dom.container = newContainerEl;
            this.dom.detachDarkMode = this.darkmode.on(
                dark => new Set([newContainerEl, ...this.getDomRoots()])
                    .forEach(rootEl => rootEl.classList.toggle('discovery-root-darkmode', dark))
            );

            newContainerEl.classList.add('discovery-root', 'discovery', this.isolateStyleMarker);
            newContainerEl.classList.toggle('discovery-root-darkmode', this.darkmode.value);
            newContainerEl.dataset.discoveryInstanceId = this.instanceId;
            newContainerEl.append(
                this.dom.sidebar = createElement('nav', 'discovery-sidebar'),
                this.dom.content = createElement('main', 'discovery-content', [
                    this.dom.nav = createElement('div', 'discovery-nav'),
                    this.dom.pageContent = createElement('article')
                ])
            );

            // cancel transitions on attach
            newContainerEl.style.transition = 'none';
            requestAnimationFrame(() => newContainerEl.style.transition = '');

            this.nav.render(this.dom.nav);
            attachViewInspector(this);
        } else {
            for (let key in this.dom) {
                this.dom[key] = null;
            }
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

    addBadge() {
        console.error('Widget#addBadge() is obsoleted, use Widget#nav API instead');
    }

    //
    // Render common
    //

    scheduleRender(subject) {
        const scheduler = renderScheduler.get(this);

        if (scheduler.has(subject)) {
            return;
        }

        scheduler.add(subject);

        if (scheduler.timer) {
            return;
        }

        scheduler.timer = Promise.resolve().then(async () => {
            for (const subject of scheduler) {
                switch (subject) {
                    case 'sidebar':
                        await this.renderSidebar();
                        break;
                    case 'page':
                        await this.renderPage();
                        break;
                }
            }

            scheduler.timer = null;
        });
    }

    cancelScheduledRender(subject) {
        const scheduledRenders = renderScheduler.get(this);

        if (scheduledRenders) {
            if (subject) {
                scheduledRenders.delete(subject);
            } else {
                scheduledRenders.clear();
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
        renderScheduler.get(this).delete('sidebar');

        if (this.view.isDefined('sidebar')) {
            const renderStartTime = Date.now();
            const data = this.data;
            const context = this.getRenderContext();

            this.view.setViewRoot(this.dom.sidebar, 'sidebar', { data, context });

            this.dom.sidebar.innerHTML = '';
            return this.view.render(
                this.dom.sidebar,
                'sidebar',
                data,
                context
            ).then(() => console.log(`[Discovery] Sidebar rendered in ${Date.now() - renderStartTime}ms`));
        }
    }

    //
    // Page
    //

    encodePageHash(pageId, pageRef, pageParams) {
        const encodeParams = getPageMethod(this, pageId, 'encodeParams', defaultEncodeParams);
        let encodedParams = encodeParams(pageParams || {});

        if (encodedParams && typeof encodedParams !== 'string') {
            if (!Array.isArray(encodedParams)) {
                encodedParams = Object.entries(encodedParams);
            }

            encodedParams = encodedParams
                .map(pair => pair.map(encodeURIComponent).join('='))
                .join('&');
        }

        return `#${
            pageId !== this.defaultPageId ? encodeURIComponent(pageId) : ''
        }${
            (typeof pageRef === 'string' && pageRef) || (typeof pageRef === 'number') ? ':' + encodeURIComponent(pageRef) : ''
        }${
            encodedParams ? '&' + encodedParams : ''
        }`;
    }

    decodePageHash(hash) {
        const delimIndex = (hash.indexOf('&') + 1 || hash.length + 1) - 1;
        const [pageId, pageRef] = hash.substring(1, delimIndex).split(':').map(decodeURIComponent);
        const decodeParams = getPageMethod(this, pageId || this.defaultPageId, 'decodeParams', defaultDecodeParams);
        const pairs = hash.substr(delimIndex + 1).split('&').filter(Boolean).map(pair => {
            const eqIndex = pair.indexOf('=');
            return eqIndex !== -1
                ? [decodeURIComponent(pair.slice(0, eqIndex)), decodeURIComponent(pair.slice(eqIndex + 1))]
                : [decodeURIComponent(pair), true];
        });

        return {
            pageId: pageId || this.defaultPageId,
            pageRef,
            pageParams: decodeParams(pairs)
        };
    }

    setPage(pageId, pageRef, pageParams, replace = false) {
        return this.setPageHash(
            this.encodePageHash(pageId || this.defaultPageId, pageRef, pageParams),
            replace
        );
    }

    setPageRef(pageRef, replace = false) {
        return this.setPage(this.pageId, pageRef, this.pageParams, replace);
    }

    setPageParams(pageParams, replace = false) {
        return this.setPage(this.pageId, this.pageRef, pageParams, replace);
    }

    setPageHash(hash, replace = false) {
        const { pageId, pageRef, pageParams } = this.decodePageHash(hash);

        if (this.pageId !== pageId ||
            this.pageRef !== pageRef ||
            !equal(this.pageParams, pageParams)) {

            this.pageId = pageId;
            this.pageRef = pageRef;
            this.pageParams = pageParams;
            this.scheduleRender('page');

            if (hash !== this.pageHash) {
                this.pageHash = hash;
                this.emit('pageHashChange', replace);

                return true;
            }
        }

        return false;
    }

    renderPage() {
        // cancel scheduled renderPage
        renderScheduler.get(this).delete('page');

        const data = this.data;
        const context = this.getRenderContext();
        const { pageEl, renderState, config } = this.page.render(
            this.dom.pageContent,
            this.pageId,
            data,
            context
        );

        this.view.setViewRoot(pageEl, 'Page: ' + this.pageId, {
            config,
            data,
            context
        });

        this.dom.pageContent = pageEl;
        this.nav.render(this.dom.nav);

        setDatasetValue(this.dom.container, 'dzen', this.pageParams.dzen);
        setDatasetValue(this.dom.container, 'compact', this.options.compact);

        return renderState;
    }
}
