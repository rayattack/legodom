/**
 * The block composition graph.
 *
 * A LegoDOM block keeps its markup as a plain string on the registry entry, so
 * the tags one block renders are read straight out of that source rather than
 * inferred from a bundler's module records. The graph here is therefore exact:
 * an edge exists because one template names the other, not because two files
 * landed in the same chunk. Everything that later decides what a change can
 * affect leans on that being true, which is why this module only consumes the
 * `children` list discover.js already extracted and never re-derives it.
 *
 * Blocks are allowed to recurse. A tree node that renders itself is a normal
 * and valid pattern, so a cycle is information to show a developer rather than
 * an error to raise. That has one consequence everywhere below: every walk is
 * guarded by a visited set or a colouring, and none of them may run forever.
 */

/**
 * The node list for a manifest. `order` is the manifest's own stable iteration
 * order and is preferred; a hand built manifest that omits it still works,
 * sorted by tag, because a caller asking one question about the graph should
 * not have to keep two fields in step to do it.
 */
export const manifestOrder = (manifest) => {
  const blocks = (manifest && manifest.blocks) || {};
  const raw = manifest && Array.isArray(manifest.order) && manifest.order.length
    ? manifest.order
    : Object.keys(blocks).sort();
  const seen = new Set();
  const out = [];
  for (const tag of raw) {
    if (typeof tag !== 'string' || !tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
};

/**
 * A block's children, restricted to tags that are themselves nodes. A template
 * may name an element the scan never found (a plain custom element, a typo, a
 * block outside the include glob), and an edge pointing at a node that does
 * not exist would break every traversal that assumes an adjacency entry.
 */
const childrenOf = (manifest, tag, nodeSet) => {
  const info = ((manifest && manifest.blocks) || {})[tag];
  const kids = info && Array.isArray(info.children) ? info.children : [];
  const seen = new Set();
  const out = [];
  for (const kid of kids) {
    if (typeof kid !== 'string' || !nodeSet.has(kid) || seen.has(kid)) continue;
    seen.add(kid);
    out.push(kid);
  }
  return out.sort();
};

/**
 * Everything reachable from `start`, excluding `start` itself. The visited set
 * is what makes this safe on a recursive block: a tag already found is never
 * expanded twice, so a cycle costs one extra dequeue rather than a hang.
 */
const reachable = (start, adjacency) => {
  const found = new Set();
  const queue = (adjacency.get(start) || []).slice();
  while (queue.length) {
    const tag = queue.shift();
    if (found.has(tag)) continue;
    found.add(tag);
    for (const next of adjacency.get(tag) || []) {
      if (!found.has(next)) queue.push(next);
    }
  }
  found.delete(start);
  return [...found].sort();
};

/**
 * Rotate a cycle so it starts at its lexicographically smallest member. The
 * same loop can be entered from any of its members depending on which node the
 * walk reached first, and a graph that prints differently between two runs is
 * a graph nobody can commit, so the recorded form is pinned to one rotation.
 */
const canonicalCycle = (chain) => {
  let at = 0;
  for (let i = 1; i < chain.length; i++) {
    if (chain[i] < chain[at]) at = i;
  }
  return chain.slice(at).concat(chain.slice(0, at));
};

/**
 * Iterative depth first search with the classic three colours: white for
 * untouched, grey for on the current path, black for finished. An edge into a
 * grey node is a back edge, and the slice of the current path from that node
 * up to the head is the cycle.
 *
 * The recursion is unrolled onto an explicit stack because a deep block tree
 * is normal and overflowing the call stack on someone's design system would be
 * a silly way to fail. This records one cycle per back edge rather than every
 * simple cycle in the graph, which is the right trade: a developer wants to
 * know that `tree-node` recurses, not to read the exponential enumeration of
 * loops that fact implies.
 */
const findCycles = (nodes, adjacency) => {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map(nodes.map(tag => [tag, WHITE]));
  const pathIndex = new Map();
  const path = [];
  const recorded = new Set();
  const cycles = [];

  const record = (chain) => {
    const cycle = canonicalCycle(chain);
    const key = cycle.join('>');
    if (recorded.has(key)) return;
    recorded.add(key);
    cycles.push(cycle);
  };

  const open = (tag, stack) => {
    colour.set(tag, GREY);
    pathIndex.set(tag, path.length);
    path.push(tag);
    stack.push({ tag, kids: adjacency.get(tag) || [], at: 0 });
  };

  for (const root of nodes) {
    if (colour.get(root) !== WHITE) continue;
    const stack = [];
    open(root, stack);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.at < frame.kids.length) {
        const child = frame.kids[frame.at++];
        const state = colour.get(child);
        if (state === GREY) record(path.slice(pathIndex.get(child)));
        else if (state === WHITE) open(child, stack);
        continue;
      }
      colour.set(frame.tag, BLACK);
      pathIndex.delete(frame.tag);
      path.pop();
      stack.pop();
    }
  }

  return cycles.sort((a, b) => (a.join('>') < b.join('>') ? -1 : 1));
};

/**
 * Build the composition graph for a manifest.
 *
 * @param {object} manifest
 * @returns {object} a BlockGraph, shaped as core/contracts.js describes it
 */
export function buildGraph(manifest) {
  const nodes = manifestOrder(manifest);
  const nodeSet = new Set(nodes);

  const down = new Map();
  const up = new Map();
  for (const tag of nodes) {
    down.set(tag, []);
    up.set(tag, []);
  }

  const edges = [];
  for (const tag of nodes) {
    for (const kid of childrenOf(manifest, tag, nodeSet)) {
      edges.push([tag, kid]);
      down.get(tag).push(kid);
      up.get(kid).push(tag);
    }
  }
  edges.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  for (const list of up.values()) list.sort();

  const dependencies = {};
  const dependents = {};
  for (const tag of nodes) {
    dependencies[tag] = reachable(tag, down);
    dependents[tag] = reachable(tag, up);
  }

  return { nodes, edges, dependents, dependencies, cycles: findCycles(nodes, down) };
}

/**
 * A leaves first ordering: a block never appears before a block it renders.
 * Snapshotting wants this so a child's output has settled before the parent
 * that composes it is looked at.
 *
 * A cycle has no valid order, so each recorded one is cut at exactly one edge:
 * the edge that closes the canonical rotation, which is the one pointing back
 * at the cycle's smallest tag. Cutting at a named place rather than wherever
 * the walk first noticed keeps the result identical between runs. The visited
 * guard stays regardless, because overlapping loops can leave a back edge that
 * no recorded cycle covers.
 */
export function topoOrder(graph) {
  const nodes = (graph && Array.isArray(graph.nodes)) ? graph.nodes : [];
  const kids = new Map(nodes.map(tag => [tag, []]));

  const cut = new Set();
  for (const cycle of (graph && graph.cycles) || []) {
    if (!Array.isArray(cycle) || !cycle.length) continue;
    cut.add(`${cycle[cycle.length - 1]} ${cycle[0]}`);
  }

  for (const [parent, child] of (graph && graph.edges) || []) {
    if (parent === child) continue;
    if (!kids.has(parent) || !kids.has(child)) continue;
    if (cut.has(`${parent} ${child}`)) continue;
    kids.get(parent).push(child);
  }

  const OPEN = 1;
  const DONE = 2;
  const state = new Map();
  const out = [];

  for (const root of nodes) {
    if (state.get(root)) continue;
    state.set(root, OPEN);
    const stack = [{ tag: root, kids: kids.get(root) || [], at: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.at < frame.kids.length) {
        const child = frame.kids[frame.at++];
        // Finished, or still open further up this path: descending again would
        // either repeat work or loop.
        if (state.get(child)) continue;
        state.set(child, OPEN);
        stack.push({ tag: child, kids: kids.get(child) || [], at: 0 });
        continue;
      }
      state.set(frame.tag, DONE);
      out.push(frame.tag);
      stack.pop();
    }
  }

  return out;
}
