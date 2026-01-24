import { bIf } from './b-if.js';
import { bShow } from './b-show.js';
import { bText } from './b-text.js';
import { bHtml } from './b-html.js';
import { bSync } from './b-sync.js';
import { bFor } from './b-for.js';
import { bInit } from './b-init.js';


export const directives = {
  'b-if': bIf,
  'b-show': bShow,
  'b-text': bText,
  'b-html': bHtml,
  'b-sync': bSync,
  'b-for': bFor,
  'b-init': bInit
};
