import * as base64 from './base64.js';
import * as compare from './compare.js';
import copyText from './copy-text.js';
import * as dataLoad from './data-load.js';
import debounce from './debounce.js';
import * as dom from './dom.js';
import * as html from './html.js';
import * as json from './json.js';
import * as layout from './layout.js';
import * as pattern from './pattern.js';
import * as persistent from './persistent.js';
import * as pointer from './pointer.js';
import safeFilterRx from './safe-filter-rx.js';
import * as size from './size.js';

export default {
    base64,
    ...compare,
    copyText,
    ...dataLoad,
    debounce,
    ...dom,
    ...html,
    ...json,
    ...layout,
    pattern,
    persistent,
    ...pointer,
    safeFilterRx,
    ...size
};
