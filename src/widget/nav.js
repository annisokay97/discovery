import { createFragment } from '../core/utils/dom.js';

function createNavArray(host, defaults) {
    const items = [];
    const insert = (config, position, ref) => {
        switch (position) {
            case 'after':
                position = items.findIndex(item => item.name === ref);
                if (position === -1) {
                    position = items.length;
                } else {
                    position++;
                }
                break;
            case 'before':
                position = items.findIndex(item => item.name === ref);
                if (position === -1) {
                    position = items.length;
                }
                break;

            default:
                if (position === undefined || isNaN(position) || !isFinite(position)) {
                    position = items.length;
                }
        }

        items.splice(Math.max(0, Math.min(items.length, position)), 0, host.view.composeConfig(defaults, config));
    };

    return Object.assign(items, {
        insert,
        prepend(config) {
            insert(config, 0);
        },
        append(config) {
            insert(config);
        },
        before(name, config) {
            insert(config, 'before', name);
        },
        after(name, config) {
            insert(config, 'after', name);
        }
    });
}

export class WidgetNavigation {
    constructor(host) {
        this.host = host;
        this.popup = null;
        this.primary = createNavArray(host, 'nav-button');
        this.secondary = createNavArray(host, 'nav-button');
        this.menu = createNavArray(host, 'menu-item');
        this.config = [
            this.secondary,
            {
                view: 'nav-button',
                name: 'burger',
                data: () => {
                    const fragment = createFragment();

                    return this.host.view.render(fragment, this.menu, this.host.data, this.host.context)
                        .then(() => [...fragment.childNodes]);
                },
                whenData: true,
                onClick: (el, nodes) => {
                    if (!this.popup) {
                        this.popup = new this.host.view.Popup();
                    }

                    this.popup.toggle(el, (el) => el.append(...nodes));
                }
            },
            this.primary
        ];

        Object.assign(this, this.secondary);
    }
    render() {
        const { view, data, context, dom } = this.host;
        const el = dom && dom.nav;

        if (el) {
            el.innerHTML = '';
            view.render(el, this.config, data, { ...context, widget: this.host });
        }
    }
};