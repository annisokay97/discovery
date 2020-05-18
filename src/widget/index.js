/* eslint-env browser */

import Core from './core.js';
import PageRenderer from '../core/page.js';
import * as pages from '../pages/index.js';
import { createElement } from '../core/utils/dom.js';
import { equal } from '../core/utils/compare.js';

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

export default class Widget extends Core {
    constructor(container, defaultPage, options) {
        const extend = (host) => {
            host.page = new PageRenderer(host.view);
            host.page.on('define', (pageId, page) => {
                const { resolveLink } = page.options;

                if (typeof resolveLink !== 'undefined') {
                    console.warn('"resolveLink" in "page.define()" options is deprecated, use "page" option for "defineObjectMarker()" method in prepare function');
                }

                // FIXME: temporary solution to avoid missed custom page's `decodeParams` method call on initial render
                if (host.pageId === pageId && host.pageHash !== '#') {
                    const hash = host.pageHash;
                    host.pageHash = '#';
                    host.setPageHash(hash);
                    host.cancelScheduledRender();
                }
            });

            host.queryExtensions = {
                pageLink: (pageRef, pageId, pageParams) =>
                    host.encodePageHash(pageId, pageRef, pageParams)
            };

            host.defaultPageId = host.options.defaultPageId || 'default';
            host.reportPageId = host.options.reportPageId || 'report';
            host.pageId = host.defaultPageId;
            host.pageRef = null;
            host.pageParams = {};
            host.pageHash = host.encodePageHash(host.pageId, host.pageRef, host.pageParams);
            host.badges = [];

            host.apply(pages);

            if (defaultPage) {
                host.page.define(host.defaultPageId, defaultPage);
            }
        };

        super(container, {
            ...options,
            extensions: options && options.extensions
                ? [extend, options.extensions]
                : extend
        });
    }

    //
    // UI
    //

    initContainer(container, refs) {
        super.initContainer(container, refs);

        refs.content.before(
            refs.sidebar = createElement('nav', 'discovery-sidebar')
        );
        refs.content.append(
            refs.badges = createElement('div', 'discovery-content-badges')
        );
        refs.content.append(
            refs.pageContent = createElement('article')
        );

        this.badges.forEach(badge =>
            refs.badges.appendChild(badge.el)
        );
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
        const pairs = hash.substr(delimIndex + 1).split('&').map(pair => {
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
