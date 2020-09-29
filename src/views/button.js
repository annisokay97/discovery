/* eslint-env browser */

import usage from './button.usage.js';

export default function(discovery) {
    function render(el, config, data, context) {
        const { content, disabled = false, onClick } = config;
        const { text = '', href, external } = data || {};

        el.classList.add('view-button');

        if (discovery.query(disabled, data, context)) {
            el.disabled = true;
        } else if (typeof onClick === 'function') {
            el.addEventListener('click', () => onClick(el, data, context));
            el.classList.add('onclick');
        } else if (href) {
            el.href = href;
            el.target = external ? '_blank' : '';
        }

        if (content) {
            return discovery.view.render(el, content, data, context);
        } else {
            el.textContent = text;
        }
    }

    discovery.view.define('button', render, { tag: 'button', usage });
    discovery.view.define('button-primary', render, { tag: 'button', usage });
    discovery.view.define('button-danger', render, { tag: 'button', usage });
    discovery.view.define('button-warning', render, { tag: 'button', usage });
}
