import { createElement } from '../../core/utils/dom.js';

const styles = ['none', 'default', 'badge'];

export default function(discovery) {
    function render() {
        const startTime = Date.now();
        let i = 0;

        for (; i < renderQueue.length; i++) {
            if (i % 20 === 0 && Date.now() - startTime > 10) {
                break;
            }

            const { el, data } = renderQueue[i];
            const {
                place = 'after',
                className,
                text = typeof data !== 'object' ? String(data) : '',
                title,
                icon,
                href,
                external
            } = data;
            const style = styles.includes(data.style) ? data.style : (place === 'before' ? 'none' : 'default');
            const hasText = text !== '';
            const elClassName = [
                'value-annotation',
                'style-' + style,
                place === 'before' ? 'before' : 'after',
                hasText ? 'has-text' : '',
                className || ''
            ].join(' ');

            const annotationEl = createElement(href ? 'a' : 'span', {
                class: elClassName,
                title,
                href,
                target: external ? '_blank' : undefined
            }, text !== '' ? [text] : undefined);

            if (icon) {
                annotationEl.classList.add('icon');

                if (/^[a-z_$][a-z0-9_$-]*$/i.test(icon)) {
                    annotationEl.classList.add('icon-' + icon);
                } else {
                    annotationEl.style.setProperty('--annotation-image', `url("${icon}")`);
                }
            }

            if (place === 'before') {
                el.before(annotationEl);
            } else {
                el.parentNode.append(annotationEl);
            }
        }

        renderQueue.splice(0, i);
    }

    function scheduleRender() {
        if (annotationsTimer === null && renderQueue.length) {
            annotationsTimer = Promise.resolve().then(() => {
                annotationsTimer = null;
                render();

                if (renderQueue.length) {
                    scheduleRender();
                }
            }, 0);
        }
    }

    function apply(el, value, options, context) {
        for (const annotation of options.annotations) {
            try {
                const { query, debug } = annotation;
                const data = discovery.query(query, value, context);

                if (debug) {
                    console.info({ annotation, value, context, data });
                }

                if (data) {
                    renderQueue.push({ el, data });
                }
            } catch (e) {
                console.error(e);
            }
        }

        scheduleRender();
    }

    const renderQueue = [];
    let annotationsTimer = null;

    return {
        apply,
        scheduleRender
    };
}
