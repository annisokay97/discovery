/* eslint-env browser */

import usage from './alerts.usage.js';

export default function(discovery) {
    function render(el, config, data, context) {
        const { content = 'text' } = config;

        el.classList.add('view-alert');

        return discovery.view.render(el, content, data, context);
    }

    discovery.view.define('alert', render, { usage });
    discovery.view.define('alert-success', render, { usage });
    discovery.view.define('alert-danger', render, { usage });
    discovery.view.define('alert-warning', render, { usage });
}
