export default function(discovery, elementData, buildPathForElement) {
    return new discovery.view.Popup({
        hoverPin: 'popup-hover',
        hoverTriggers: '.view-struct .show-signature',
        render: function(popupEl, triggerEl) {
            const el = triggerEl.parentNode;
            const data = elementData.get(el);

            discovery.view.render(popupEl, {
                view: 'signature',
                expanded: 2,
                path: buildPathForElement(el)
            }, data);
        }
    });
}
