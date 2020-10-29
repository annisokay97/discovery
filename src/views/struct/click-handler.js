export default function createClickHandler(
    expandValue,
    collapseValue,
    structViewRoots,
    annotationRenderer,
    valueActionsPopup,
    signaturePopup
) {
    return ({ target }) => {
        let action = 'expand';
        let cursor = target.closest(`
            .view-struct.struct-expand,
            .view-struct .struct-expand-value,
            .view-struct .struct-action-button
        `);

        if (!cursor) {
            return;
        }

        if (cursor.dataset.action) {
            action = cursor.dataset.action;
        }

        switch (action) {
            case 'expand':
                if (cursor.classList.contains('struct-expand')) {
                    // expand root element
                    cursor = cursor.lastChild;
                }

                // expand value
                expandValue(cursor, 0);
                annotationRenderer.scheduleRender();
                cursor.parentNode.classList.add('struct-expanded-value');

                if (structViewRoots.has(cursor.parentNode)) {
                    cursor.parentNode.classList.remove('struct-expand');
                }
                break;

            case 'collapse':
                cursor = cursor.parentNode;
                collapseValue(cursor);
                annotationRenderer.scheduleRender();
                cursor.parentNode.classList.remove('struct-expanded-value');

                if (structViewRoots.has(cursor.parentNode)) {
                    cursor.parentNode.classList.add('struct-expand');
                }
                break;

            case 'show-signature':
                signaturePopup.show(cursor);
                break;

            case 'value-actions':
                valueActionsPopup.show(cursor);
                break;

            case 'toggle-sort-keys':
                expandValue(cursor.parentNode, 0, cursor.parentNode.classList.toggle('sort-keys'));
                annotationRenderer.scheduleRender();
                break;

            case 'toggle-string-mode':
                cursor = cursor.parentNode;

                const stringTextNode = cursor.querySelector('.string-text').firstChild;

                stringTextNode.nodeValue = cursor.classList.toggle('string-value-as-text')
                    ? JSON.parse(`"${stringTextNode.nodeValue}"`)
                    : JSON.stringify(stringTextNode.nodeValue).slice(1, -1);
                break;
        }
    };
}
