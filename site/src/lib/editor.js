// CodeMirror setup for the docs editor. Loaded on demand (it is only ever
// imported dynamically) so pages without an editor do not pay for it.
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { keymap, Decoration, ViewPlugin, MatchDecorator } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { tags as t } from '@lezer/highlight';

const theme = EditorView.theme({
  '&': { color: '#ece9df', backgroundColor: 'transparent', height: '100%', fontSize: '13.5px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--lg-font-mono)', lineHeight: '1.65', overflow: 'auto' },
  '.cm-content': { padding: '14px 0', caretColor: '#ffd43b' },
  '.cm-line': { padding: '0 16px 0 6px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: '#565b73', border: 'none', paddingLeft: '6px' },
  '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.045)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#ffd43b' },
  '.cm-cursor': { borderLeftColor: '#ffd43b', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(47, 107, 255, 0.5) !important'
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'rgba(255, 212, 59, 0.22)', outline: 'none'
  },
  '.cm-foldPlaceholder': { backgroundColor: '#2a2e40', border: 'none', color: '#a8adc2' },
  '.cm-tooltip': { backgroundColor: '#23263a', border: '2px solid #0a0b10', borderRadius: '8px', color: '#ece9df' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#2f6bff', color: '#fff' },
  '.cm-lego-expr': { backgroundColor: 'rgba(255, 212, 59, 0.14)', borderRadius: '4px', color: '#ffe27a' }
}, { dark: true });

const highlight = HighlightStyle.define([
  { tag: [t.tagName, t.angleBracket], color: '#ffd43b' },
  { tag: t.attributeName, color: '#5ee0ae' },
  { tag: [t.string, t.attributeValue, t.special(t.string)], color: '#ffb199' },
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.definitionKeyword], color: '#ff8a7a' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#8fb0ff' },
  { tag: [t.propertyName, t.function(t.variableName), t.function(t.propertyName)], color: '#8fb0ff' },
  { tag: [t.className, t.typeName], color: '#5ee0ae' },
  { tag: [t.comment, t.meta], color: '#6f7590', fontStyle: 'italic' },
  { tag: [t.punctuation, t.bracket, t.operator], color: '#a8adc2' },
  { tag: t.variableName, color: '#ece9df' },
  { tag: t.self, color: '#ff8a7a' }
]);

// Tint [[ expression ]] wherever it appears, including inside attribute
// values, where the HTML grammar sees nothing but a string.
const exprMatcher = new MatchDecorator({
  regexp: /\[\[[^\]\n]*\]\]/g,
  decoration: Decoration.mark({ class: 'cm-lego-expr' })
});
const legoExpressions = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = exprMatcher.createDeco(view); }
  update(update) { this.decorations = exprMatcher.updateDeco(update, this.decorations); }
}, { decorations: v => v.decorations });

const languageFor = (filename = '') => {
  if (/\.(js|mjs)$/.test(filename)) return javascript();
  if (/\.css$/.test(filename)) return css();
  return html({ selfClosingTags: true });
};

/**
 * @param {HTMLElement} parent
 * @param {{ doc: string, filename: string, onChange: (doc: string) => void }} options
 */
export function createEditor(parent, { doc, filename, onChange }) {
  const language = new Compartment();
  let silent = false;

  const extensions = (name) => [
    basicSetup,
    keymap.of([indentWithTab]),
    language.of(languageFor(name)),
    theme,
    syntaxHighlighting(highlight),
    legoExpressions,
    EditorState.tabSize.of(2),
    EditorView.contentAttributes.of({ 'aria-label': `Code editor, ${name}` }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !silent) onChange(update.state.doc.toString());
    })
  ];

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: extensions(filename) })
  });

  return {
    /** Swap to another file. A fresh state, so undo never crosses files. */
    open(name, text) {
      silent = true;
      view.setState(EditorState.create({ doc: text, extensions: extensions(name) }));
      silent = false;
    },
    /** Replace the text of the open file from outside (reset, show solution). */
    setDoc(text) {
      if (text === view.state.doc.toString()) return;
      silent = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      silent = false;
    },
    focus: () => view.focus(),
    destroy: () => view.destroy()
  };
}
