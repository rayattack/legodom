import { topoOrder } from './build.js';

/**
 * Draw the composition graph.
 *
 * A layered drawing, hand rolled, because the studio ships with no
 * dependencies and a graph nobody can look at is a graph nobody uses. Three
 * steps, all of them deterministic: put each node on the layer given by its
 * longest path from a root, shuffle nodes inside their layer to pull edges
 * straighter, then emit the geometry.
 *
 * Deterministic is a hard requirement, not a nicety. The output is meant to be
 * committed next to the code, so the same graph must produce byte identical
 * SVG or every diff turns into noise. That rules out anything seeded by
 * iteration order of a Set built from an object, and it is why every tie in
 * the ordering pass falls back to a named comparison.
 *
 * Coordinates go through `num()` on the way out. An SVG holding one NaN
 * renders as an empty box with no error anywhere, which is the worst kind of
 * bug to chase, so the guard sits at the boundary where numbers become text.
 */

const MARGIN = 24;
const NODE_H = 34;
const GAP_X = 26;
const GAP_Y = 62;
const ROW_GAP = 16;
const MIN_W = 96;
const CHAR_W = 7.4;
const PAD_X = 24;
const LOOP_W = 38;
const LEGEND_H = 40;

/** Never let a non finite number reach the output. */
const num = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : 0);

const escapeXML = (raw) => String(raw)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const boxWidth = (tag) => Math.max(MIN_W, Math.round(tag.length * CHAR_W + PAD_X));

/**
 * Assign layers by longest path from a root.
 *
 * `ordered` is parents before children, so every parent that can push a node
 * down has already been placed by the time the node is read. A parent that has
 * not been placed yet is reached through a cycle the ordering had to cut, and
 * ignoring it is what keeps a recursive block from asking for an infinitely
 * deep drawing.
 */
const assignLayers = (ordered, parents) => {
  const layerOf = new Map();
  for (const tag of ordered) {
    let layer = 0;
    for (const parent of parents.get(tag) || []) {
      if (parent === tag || !layerOf.has(parent)) continue;
      layer = Math.max(layer, layerOf.get(parent) + 1);
    }
    layerOf.set(tag, layer);
  }
  return layerOf;
};

/**
 * One barycentre pass over the layers. Each node moves to the mean position of
 * the neighbours it has in the layer just walked, which is the cheap classic
 * way to cut edge crossings without a real crossing count.
 */
const sweep = (layers, neighbours, from, to, step) => {
  for (let i = from; i !== to; i += step) {
    const ref = new Map(layers[i - step].map((tag, idx) => [tag, idx]));
    const current = layers[i];
    const score = new Map();
    current.forEach((tag, idx) => {
      const near = [];
      for (const other of neighbours.get(tag) || []) {
        const at = ref.get(other);
        if (at !== undefined) near.push(at);
      }
      score.set(tag, near.length ? near.reduce((a, b) => a + b, 0) / near.length : idx);
    });
    layers[i] = current
      .map((tag, idx) => ({ tag, idx }))
      .sort((a, b) => (score.get(a.tag) - score.get(b.tag)) || (a.idx - b.idx))
      .map(entry => entry.tag);
  }
};

/**
 * How a node reads at a glance: a root nothing composes, a leaf that composes
 * nothing, a solo block with no relationships at all, or an internal node.
 * Self edges are ignored for this, so a block that recurses is still described
 * by its relationship to the rest of the app.
 */
const classify = (tag, parents, kids, inCycle) => {
  const up = (parents.get(tag) || []).filter(other => other !== tag).length;
  const down = (kids.get(tag) || []).filter(other => other !== tag).length;
  const base = !up && !down ? 'solo' : !up ? 'root' : !down ? 'leaf' : 'mid';
  return inCycle.has(tag) ? `node ${base} cycle` : `node ${base}`;
};

const STYLE = `
  .bg { fill: #ffffff; }
  .node rect { fill: #f4f6fa; stroke: #b9c2d0; stroke-width: 1.2; }
  .node text { fill: #1d2430; font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .root rect { fill: #e8f0fe; stroke: #6d92d8; }
  .leaf rect { fill: #eaf6ee; stroke: #6fae86; }
  .solo rect { fill: #f6f1e7; stroke: #c2a86a; }
  .cycle rect { stroke: #c96a4f; stroke-width: 2; stroke-dasharray: 5 3; }
  .edge { fill: none; stroke: #97a2b4; stroke-width: 1.3; }
  .edge.self { stroke: #c96a4f; }
  .legend text { fill: #5a6472; font: 400 11px ui-sans-serif, system-ui, sans-serif; }
  .legend rect { stroke-width: 1.2; }
  @media (prefers-color-scheme: dark) {
    .bg { fill: #14171c; }
    .node rect { fill: #232833; stroke: #47525f; }
    .node text { fill: #e6eaf0; }
    .root rect { fill: #1f2c44; stroke: #5b81c9; }
    .leaf rect { fill: #1d2f26; stroke: #4f9070; }
    .solo rect { fill: #322c1f; stroke: #a78c4e; }
    .cycle rect { stroke: #e08768; }
    .edge { stroke: #5b6675; }
    .edge.self { stroke: #e08768; }
    .legend text { fill: #9aa4b2; }
  }
`;

/** The empty drawing. A studio with no blocks yet should say so, not crash. */
const emptySVG = (width) => {
  const w = Math.max(240, num(width) || 320);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="80" viewBox="0 0 ${w} 80" role="img" aria-label="No blocks">`,
    `<style>${STYLE}</style>`,
    `<rect class="bg" x="0" y="0" width="${w}" height="80"/>`,
    `<g class="legend"><text x="${MARGIN}" y="44">No blocks found.</text></g>`,
    '</svg>'
  ].join('\n');
};

/**
 * Render a BlockGraph as an SVG string.
 *
 * @param {object} graph
 * @param {object} [options]
 * @param {object} [options.manifest] used only for the hover title on a node
 * @param {number} [options.width] target canvas width: rows wrap to it and the
 *   canvas never shrinks below it
 * @returns {string}
 */
export function graphToSVG(graph, { manifest, width } = {}) {
  const nodes = (graph && Array.isArray(graph.nodes)) ? graph.nodes.slice() : [];
  if (!nodes.length) return emptySVG(width);

  const nodeSet = new Set(nodes);
  const kids = new Map(nodes.map(tag => [tag, []]));
  const parents = new Map(nodes.map(tag => [tag, []]));
  const selfEdges = new Set();
  const drawn = [];

  for (const edge of (graph && graph.edges) || []) {
    if (!Array.isArray(edge) || edge.length < 2) continue;
    const [parent, child] = edge;
    if (!nodeSet.has(parent) || !nodeSet.has(child)) continue;
    if (parent === child) {
      selfEdges.add(parent);
      continue;
    }
    kids.get(parent).push(child);
    parents.get(child).push(parent);
    drawn.push([parent, child]);
  }

  const inCycle = new Set();
  for (const cycle of (graph && graph.cycles) || []) {
    for (const tag of cycle || []) inCycle.add(tag);
  }

  // Parents before children, so the longest path calculation only ever reads
  // layers that are already settled.
  const ordered = topoOrder(graph).slice().reverse();
  const placed = new Set(ordered);
  const layerOf = assignLayers(ordered.concat(nodes.filter(tag => !placed.has(tag))), parents);

  const depth = Math.max(...nodes.map(tag => layerOf.get(tag) || 0)) + 1;
  const layers = [];
  for (let i = 0; i < depth; i++) layers.push([]);
  for (const tag of nodes) layers[layerOf.get(tag) || 0].push(tag);

  // Three passes is enough to settle a graph of this size, and stopping at a
  // fixed count keeps the drawing reproducible rather than dependent on when a
  // convergence check happened to trip.
  if (depth > 1) {
    sweep(layers, parents, 1, depth, 1);
    sweep(layers, kids, depth - 2, -1, -1);
    sweep(layers, parents, 1, depth, 1);
  }

  // A real app has every page as a root, so layer zero is routinely twenty
  // blocks wide. Left on one line that is a drawing nobody can read, so a
  // layer wraps into rows once it passes the target width. Wrapping happens
  // greedily in the settled order, which keeps it deterministic and keeps a
  // node next to the neighbours the sweeps put it beside.
  const cap = Math.max(360, num(width) || 1200);
  const rows = [];
  layers.forEach((layer, index) => {
    let tags = [];
    let used = 0;
    for (const tag of layer) {
      const w = boxWidth(tag);
      const next = tags.length ? used + GAP_X + w : w;
      if (tags.length && next > cap) {
        rows.push({ layer: index, tags, width: used });
        tags = [tag];
        used = w;
        continue;
      }
      tags.push(tag);
      used = next;
    }
    if (tags.length) rows.push({ layer: index, tags, width: used });
  });

  const box = new Map();
  const lane = Math.max(...rows.map(row => row.width), 0);
  let y = MARGIN;
  rows.forEach((row, index) => {
    if (index > 0) y += NODE_H + (row.layer === rows[index - 1].layer ? ROW_GAP : GAP_Y);
    let x = MARGIN + (lane - row.width) / 2;
    for (const tag of row.tags) {
      const w = boxWidth(tag);
      box.set(tag, { x, y, w, h: NODE_H, cx: x + w / 2 });
      x += w + GAP_X;
    }
  });

  let right = 0;
  for (const tag of nodes) {
    const b = box.get(tag);
    right = Math.max(right, b.x + b.w + (selfEdges.has(tag) ? LOOP_W : 0));
  }
  const svgW = Math.max(num(width) || 0, right + MARGIN);
  const svgH = y + NODE_H + MARGIN + LEGEND_H;

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${num(svgW)}" height="${num(svgH)}" viewBox="0 0 ${num(svgW)} ${num(svgH)}" role="img" aria-label="LegoDOM block graph">`);
  out.push(`<style>${STYLE}</style>`);
  out.push(`<rect class="bg" x="0" y="0" width="${num(svgW)}" height="${num(svgH)}"/>`);

  out.push('<g class="edges">');
  for (const [parent, child] of drawn) {
    const a = box.get(parent);
    const b = box.get(child);
    const y1 = a.y + a.h;
    const y2 = b.y;
    const bend = Math.max(18, Math.abs(y2 - y1) / 2);
    out.push(`<path class="edge" d="M ${num(a.cx)} ${num(y1)} C ${num(a.cx)} ${num(y1 + bend)}, ${num(b.cx)} ${num(y2 - bend)}, ${num(b.cx)} ${num(y2)}"/>`);
  }
  for (const tag of nodes) {
    if (!selfEdges.has(tag)) continue;
    const b = box.get(tag);
    const edge = b.x + b.w;
    out.push(`<path class="edge self" d="M ${num(edge)} ${num(b.y + 9)} C ${num(edge + LOOP_W)} ${num(b.y - 8)}, ${num(edge + LOOP_W)} ${num(b.y + b.h + 8)}, ${num(edge)} ${num(b.y + b.h - 9)}"/>`);
  }
  out.push('</g>');

  const blocks = (manifest && manifest.blocks) || {};
  for (const tag of nodes) {
    const b = box.get(tag);
    const info = blocks[tag];
    const detail = info
      ? `${info.relFile || info.file || tag} (${(info.stories || []).length} stories)`
      : tag;
    out.push(`<g class="${classify(tag, parents, kids, inCycle)}">`);
    out.push(`<title>${escapeXML(detail)}</title>`);
    out.push(`<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" rx="8" ry="8"/>`);
    out.push(`<text x="${num(b.cx)}" y="${num(b.y + b.h / 2 + 4)}" text-anchor="middle">${escapeXML(tag)}</text>`);
    out.push('</g>');
  }

  const legendY = svgH - LEGEND_H + 14;
  const items = [['root', 'root'], ['mid', 'composed'], ['leaf', 'leaf'], ['cycle', 'recurses']];
  out.push('<g class="legend">');
  items.forEach(([cls, label], index) => {
    const x = MARGIN + index * 110;
    out.push(`<g class="node ${cls}"><rect x="${num(x)}" y="${num(legendY)}" width="14" height="14" rx="3" ry="3"/></g>`);
    out.push(`<text x="${num(x + 20)}" y="${num(legendY + 11)}">${escapeXML(label)}</text>`);
  });
  out.push('</g>');
  out.push('</svg>');

  return out.join('\n');
}
