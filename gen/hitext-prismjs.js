var Prism = require('/gen/prismjs.js').default;
var global = {Prism};
var module = undefined;
var hitextPrismjs;
var define = function() {
    const fn = arguments[arguments.length - 1];
    hitextPrismjs = fn();
    define = undefined;
};
define.amd = true;
!function(n,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):(n=n||self).hitextPrismjs=e()}(this,(function(){"use strict";const{tokenize:n,languages:e}=global.Prism||require("prismjs"),t={html:{open:({data:n})=>'<span class="token '+n+'">',close:()=>"</span>"}};function o(n,e,t){n.forEach((function(n){"string"!=typeof n&&function(n,e,t){e(t,t+n.length,n.type),Array.isArray(n.content)&&o(n.content,e,t)}(n,e,t),t+=n.length}))}return function(i){return{printer:t,ranges:function(t,r){return o(n(t,e[i]),r,0)}}}}));

Object.defineProperty(exports, "__esModule", { value: true });
exports.default = hitextPrismjs;