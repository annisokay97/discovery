/* eslint-env browser */
import usage from './nav-button.usage.js';

export default function(discovery) {
    discovery.view.define('nav-button', function(el, config, data, context) {
        const { name, content, disabled = false, onClick } = config;
        const { text = '', href, external } = data || {};

        if (name) {
            el.dataset.name = name;
        }

        if (discovery.query(disabled, data, context)) {
            el.classList.add('disabled');
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
    }, {
        tag: 'a',
        usage
    });
}
