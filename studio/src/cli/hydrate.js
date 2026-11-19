/**
 * `lego-studio hydrate`: check the server render against the hydration
 * contract, without a browser.
 *
 * Be clear about what this can and cannot prove. There is no DOM in this
 * process, so nothing here mounts a block, and nothing here can tell you that
 * hydration succeeded. What it can do is check that the markup the server
 * produced is the shape `src/core/hydrate.js` knows how to adopt, which is a
 * different and narrower claim:
 *
 *   - every `b-hydrate` host names a block the manifest actually defines
 *   - a shadow block ships a `<template shadowrootmode="open">` with its
 *     `<style>` first, which is what adoptDeclarativeShadow() looks for
 *   - a light DOM block ships a `<style data-lego-style="tag">`, which is
 *     what adoptServerLightStyle() deduplicates on
 *   - every `<!--b-for-->` anchor is followed by rows that carry `data-b-key`,
 *     all of one tag, with unique keys, each still naming the loop the anchor
 *     names, which is exactly what adoptFor() walks
 *   - every `<!--b-if-->` and `<!--b-for-->` marker names an expression some
 *     block in the manifest declares, so there is something for the client to
 *     pair it against
 *
 * That set is worth having because a snapshot cannot assert it. A snapshot
 * records whatever the renderer emitted, contract violation included, and
 * goes on recording it happily forever. These rules are the contract itself.
 *
 * Nothing here compares against `__snapshots__`. That is what `lego-studio
 * snap --check` is, it already owns that question, and a second command
 * answering it would only make two places to update when the answer changes.
 *
 * Verifying that the client agrees needs a client. That is the hydration
 * panel in the studio, which puts a real browser's DOM next to this output.
 */

import path from 'node:path';
import { discover } from '../core/discover.js';
import { createStoryRenderer } from '../core/render.js';
import { parseHTML, attrValue, findAttr } from '../../../src/server/html.js';

/** Comment prefixes the server writes in place of an element. */
const IF_MARKER = 'b-if: ';
const FOR_MARKER = 'b-for: ';

/** The key the server stamps on each rendered `b-for` row. */
const KEY_ATTR = 'data-b-key';

/** The attribute src/core/stylesheets.js deduplicates a light block's CSS on. */
const STYLE_MARKER = 'data-lego-style';

const isElement = (node) => !!node && node.type === 'el';
const isComment = (node) => !!node && node.type === 'comment';

/** Nodes that take part in structure. Whitespace between tags is not one. */
const meaningful = (nodes) => nodes.filter((node) =>
  node.type !== 'text' || node.value.trim() !== '');

const finding = (story, rule, message) => ({ storyId: story.id, block: story.block, rule, message });

/* ------------------------------------------------------------------ *
 * What the templates declare
 * ------------------------------------------------------------------ */

const collectMarkers = (nodes, into) => {
  for (const node of nodes) {
    if (!isElement(node)) continue;
    const cond = findAttr(node, 'b-if');
    if (cond) into.ifs.add(cond.value);
    const loop = findAttr(node, 'b-for');
    if (loop) into.fors.add(loop.value.replace(/\s+/g, ' ').trim());
    collectMarkers(node.children, into);
  }
};

/**
 * Every `b-if` and `b-for` expression any block in the manifest writes.
 *
 * The union rather than a per block set, on purpose. Slot content is rendered
 * in the calling block's scope and lands inside the callee's markup, so
 * attributing a marker to the block whose subtree it sits in would report a
 * projected `b-if` as foreign. A union still catches the case worth catching,
 * which is a marker no template anywhere declares and the client therefore
 * cannot pair against anything.
 *
 * @param {object} manifest
 * @returns {{ifs: Set<string>, fors: Set<string>}}
 */
export function declaredMarkers(manifest) {
  const into = { ifs: new Set(), fors: new Set() };
  for (const tag of manifest.order || []) {
    const block = manifest.blocks[tag];
    if (!block || !block.template) continue;
    try {
      collectMarkers(parseHTML(block.template, tag), into);
    } catch (err) {
      // A template that will not parse is discovery's finding to report, not
      // this one's, and there is nothing here to collect from it.
    }
  }
  return into;
}

/* ------------------------------------------------------------------ *
 * The structural rules
 * ------------------------------------------------------------------ */

/**
 * A block host and its markup, checked against what the client will look for
 * when it takes over.
 */
const checkHost = (node, story, manifest, out) => {
  const tag = node.tag;
  const block = manifest.blocks[tag];

  if (!block) {
    out.push(finding(story, 'host', `<${tag}> carries b-hydrate but no block by that name is defined.`));
    return;
  }
  if (attrValue(node, 'b-id') !== tag) {
    out.push(finding(story, 'host', `<${tag}> carries b-hydrate without a matching b-id.`));
  }

  const children = meaningful(node.children);
  // A host beyond MAX_BLOCK_DEPTH is emitted empty on purpose, and the client
  // fills it in from the template, so an empty host breaks no contract.
  if (children.length === 0) return;

  const hasCss = !!(block.css && block.css.trim());

  if (block.shadow !== false) {
    const first = children[0];
    if (!isElement(first) || first.tag !== 'template' || attrValue(first, 'shadowrootmode') !== 'open') {
      out.push(finding(story, 'shadow', `<${tag}> is a shadow block but its first child is not <template shadowrootmode="open">.`));
      return;
    }
    if (!hasCss) return;
    const inner = meaningful(first.children)[0];
    if (!isElement(inner) || inner.tag !== 'style') {
      out.push(finding(story, 'shadow', `<${tag}> has styles but its shadow template does not open with a <style>.`));
    }
    return;
  }

  if (!hasCss) return;
  const first = children[0];
  if (!isElement(first) || first.tag !== 'style') {
    out.push(finding(story, 'light', `<${tag}> is a light DOM block with styles but does not open with a <style>.`));
    return;
  }
  if (attrValue(first, STYLE_MARKER) !== tag) {
    out.push(finding(story, 'light', `<${tag}> emits a <style> without ${STYLE_MARKER}="${tag}", so instances cannot deduplicate it.`));
  }
};

/**
 * One sibling list: `b-for` anchors and the rows that follow them, plus any
 * row that turned up without an anchor to belong to.
 */
const checkForRuns = (nodes, story, out) => {
  const children = meaningful(nodes);
  const claimed = new Set();

  children.forEach((node, index) => {
    if (!isComment(node) || !node.value.startsWith(FOR_MARKER)) return;
    const source = node.value.slice(FOR_MARKER.length).trim();

    const keys = new Set();
    let tag = null;
    let at = index + 1;
    while (at < children.length && isElement(children[at]) && attrValue(children[at], KEY_ATTR) !== undefined) {
      const row = children[at];
      claimed.add(row);

      if (tag === null) tag = row.tag;
      else if (row.tag !== tag) {
        out.push(finding(story, 'b-for', `the rows after <!--b-for: ${source}--> are not all <${tag}>.`));
      }

      const key = attrValue(row, KEY_ATTR);
      if (keys.has(key)) {
        out.push(finding(story, 'b-for', `<!--b-for: ${source}--> emitted two rows keyed "${key}", so the client's pool would keep only one.`));
      }
      keys.add(key);

      // The client's adoptFor() reads the loop off the row's own b-for, so a
      // row that lost it or names a different list cannot be adopted.
      const loop = findAttr(row, 'b-for');
      const declared = loop ? loop.value.replace(/\s+/g, ' ').trim() : null;
      if (declared !== source.replace(/\s+/g, ' ').trim()) {
        out.push(finding(story, 'b-for', `a row under <!--b-for: ${source}--> declares b-for="${declared === null ? '' : declared}".`));
      }
      at++;
    }
  });

  children.forEach((node) => {
    if (!isElement(node) || attrValue(node, KEY_ATTR) === undefined) return;
    if (claimed.has(node)) return;
    out.push(finding(story, 'b-for', `<${node.tag} ${KEY_ATTR}="${attrValue(node, KEY_ATTR)}"> has no <!--b-for--> anchor before it.`));
  });
};

const checkMarkers = (node, story, markers, out) => {
  if (node.value.startsWith(IF_MARKER)) {
    const expr = node.value.slice(IF_MARKER.length);
    if (!markers.ifs.has(expr)) {
      out.push(finding(story, 'marker', `<!--b-if: ${expr}--> names an expression no block declares.`));
    }
    return;
  }
  if (!node.value.startsWith(FOR_MARKER)) return;
  const expr = node.value.slice(FOR_MARKER.length).replace(/\s+/g, ' ').trim();
  if (!markers.fors.has(expr)) {
    out.push(finding(story, 'marker', `<!--b-for: ${expr}--> names a loop no block declares.`));
  }
};

const walk = (nodes, story, manifest, markers, out) => {
  checkForRuns(nodes, story, out);
  for (const node of nodes) {
    if (isComment(node)) {
      checkMarkers(node, story, markers, out);
      continue;
    }
    if (!isElement(node)) continue;
    if (attrValue(node, 'b-hydrate') !== undefined) checkHost(node, story, manifest, out);
    walk(node.children, story, manifest, markers, out);
  }
};

/**
 * Check one story's server HTML against the hydration contract.
 *
 * @param {string} html - what renderToString produced
 * @param {object} story
 * @param {object} manifest
 * @param {object} markers - what declaredMarkers() returned
 * @returns {Array<{storyId: string, block: string, rule: string, message: string}>}
 */
export function validateOutput(html, story, manifest, markers) {
  const out = [];
  let nodes;
  try {
    // Strict. This is the renderer's own output, so anything the parser
    // refuses is the renderer emitting markup no parser should have to guess
    // at, and a browser guessing differently is precisely the failure mode.
    nodes = parseHTML(html, story.id);
  } catch (err) {
    out.push(finding(story, 'parse', `the rendered HTML does not parse: ${err.message}`));
    return out;
  }
  walk(nodes, story, manifest, markers, out);
  return out;
}

/* ------------------------------------------------------------------ *
 * The command
 * ------------------------------------------------------------------ */

const parseOnly = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string') return null;
  const tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
  return tags.length ? tags : null;
};

/**
 * Render and check every story.
 *
 * @param {object} manifest
 * @param {object} [options]
 * @param {string[]} [options.only] - restrict to these block tags
 * @returns {{findings: Array, stories: string[], ok: boolean}}
 */
export function verify(manifest, { only = null } = {}) {
  const scope = only && only.length ? new Set(only) : null;
  const { render } = createStoryRenderer(manifest);
  const markers = declaredMarkers(manifest);

  const findings = [];
  const stories = [];

  for (const tag of manifest.order) {
    if (scope && !scope.has(tag)) continue;
    for (const story of manifest.blocks[tag].stories) {
      stories.push(story.id);
      let html;
      try {
        html = render(story);
      } catch (err) {
        findings.push(finding(story, 'render', err.message));
        continue;
      }
      findings.push(...validateOutput(html, story, manifest, markers));
    }
  }

  return { findings, stories, ok: findings.length === 0 };
}

/**
 * @param {object} flags
 * @param {string} [flags.root] - directory to scan, defaults to the cwd
 * @param {boolean} [flags.check] - accepted and ignored; the command writes
 *   nothing, so checking is all it ever does
 * @param {string|string[]} [flags.only] - comma separated block tags
 * @returns {Promise<number>} the process exit code
 */
export async function run(flags = {}) {
  const root = path.resolve(flags.root || process.cwd());
  const manifest = await discover({ root });
  const { findings, stories, ok } = verify(manifest, { only: parseOnly(flags.only) });

  manifest.errors.forEach((message) => console.error(message));

  findings.forEach((entry) => {
    console.log(`${entry.rule} ${entry.storyId} ${entry.message}`);
  });

  console.log(`stories ${stories.length} findings ${findings.length}`);

  // Printed every run, pass or fail. A command named `hydrate` that exits 0
  // must not be read as "hydration works", and the one place that is certain
  // to be seen is the output itself.
  console.log(
    'Checked: the server markup satisfies the hydration contract. Not checked: ' +
    'that a browser adopts it, which needs a browser (the studio Hydration panel), ' +
    'and that the markup has not changed (lego-studio snap --check).'
  );

  return ok && manifest.errors.length === 0 ? 0 : 1;
}

export default run;
