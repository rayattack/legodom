import fs from 'node:fs/promises';
import path from 'node:path';
import { buildGraph } from '../graph/build.js';
import { affectedStories, unboundedFiles } from '../graph/affected.js';
import { changedFiles } from '../graph/git.js';
import { graphToSVG } from '../graph/svg.js';
import { storyId } from '../core/contracts.js';

/**
 * `lego-studio graph`.
 *
 * Shows a developer the composition graph their app actually has, and with
 * `--affected`, which stories the current diff can reach. The default output
 * is a tree on the terminal because that is what someone asks for when they
 * want to understand a codebase; the JSON and SVG forms are for tooling and
 * for pasting into a review.
 *
 * The exit code is the contract: 0 whenever the question was answered, 1 only
 * when it could not be. A graph with cycles in it is an answer, not a failure.
 */

/** Accept a repeated flag, a comma separated string, or nothing at all. */
const list = (value) => {
  if (Array.isArray(value)) {
    const items = value.filter(item => typeof item === 'string' && item);
    return items.length ? items : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return undefined;
};

const idOf = (story) => story.id || storyId(story.block, story.name);

/**
 * `--svg` with no value parses as `true`, and someone who typed it clearly
 * wants a file, so give them one rather than an error about a bad path.
 */
const svgTarget = (value) => {
  if (value === true) return 'lego-graph.svg';
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

/**
 * Children per parent, sorted, self edges kept. A block that renders itself
 * should show up in the tree as a branch that stops with `(cycle)`, which is
 * exactly what happens when the recursion guard sees the tag already on the
 * current path.
 */
const childMap = (graph) => {
  const kids = new Map(graph.nodes.map(tag => [tag, []]));
  for (const [parent, child] of graph.edges) {
    if (kids.has(parent) && kids.has(child)) kids.get(parent).push(child);
  }
  return kids;
};

/**
 * The tree. Roots first, then anything a root could not reach, which is how a
 * pure cycle with no entry point still gets printed instead of vanishing.
 */
const treeLines = (graph) => {
  const kids = childMap(graph);
  const hasParent = new Set();
  for (const [parent, child] of graph.edges) {
    if (parent !== child) hasParent.add(child);
  }

  const lines = [];
  const shown = new Set();

  const walk = (tag, prefix, onPath) => {
    const children = kids.get(tag) || [];
    children.forEach((child, index) => {
      const last = index === children.length - 1;
      const repeat = onPath.has(child);
      lines.push(`${prefix}${last ? '`- ' : '|- '}${child}${repeat ? ' (cycle)' : ''}`);
      shown.add(child);
      if (repeat) return;
      onPath.add(child);
      walk(child, `${prefix}${last ? '   ' : '|  '}`, onPath);
      onPath.delete(child);
    });
  };

  const roots = graph.nodes.filter(tag => !hasParent.has(tag));
  for (const root of roots) {
    lines.push(root);
    shown.add(root);
    walk(root, '', new Set([root]));
  }
  for (const tag of graph.nodes) {
    if (shown.has(tag)) continue;
    lines.push(tag);
    shown.add(tag);
    walk(tag, '', new Set([tag]));
  }
  return lines;
};

const summary = (graph) => {
  const parts = [
    `${graph.nodes.length} ${graph.nodes.length === 1 ? 'block' : 'blocks'}`,
    `${graph.edges.length} ${graph.edges.length === 1 ? 'edge' : 'edges'}`
  ];
  if (graph.cycles.length) {
    parts.push(`${graph.cycles.length} ${graph.cycles.length === 1 ? 'cycle' : 'cycles'}`);
  }
  return parts.join(', ');
};

/**
 * Run the command.
 *
 * @param {object} [flags] root, json, svg, affected, base, include, exclude
 * @returns {Promise<number>} process exit code
 */
export async function run(flags = {}) {
  const root = path.resolve(flags.root || process.cwd());

  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      console.error(`lego-studio graph: not a directory: ${root}`);
      return 1;
    }
  } catch {
    console.error(`lego-studio graph: cannot read ${root}`);
    return 1;
  }

  let manifest;
  try {
    // Imported here rather than at module scope so the graph modules stay
    // importable, and unit testable, without the scanner being present.
    const { discover } = await import('../core/discover.js');
    manifest = await discover({ root, include: list(flags.include), exclude: list(flags.exclude) });
  } catch (err) {
    console.error(`lego-studio graph: discovery failed: ${err && err.message ? err.message : err}`);
    return 1;
  }

  const graph = buildGraph(manifest);

  const svgOut = svgTarget(flags.svg);
  if (svgOut) {
    const target = path.resolve(root, svgOut);
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, graphToSVG(graph, { manifest }), 'utf8');
    } catch (err) {
      console.error(`lego-studio graph: cannot write ${target}: ${err && err.message ? err.message : err}`);
      return 1;
    }
  }

  let affected = null;
  if (flags.affected) {
    const files = await changedFiles({ root, base: flags.base });
    const stories = affectedStories(manifest, graph, files);
    const unbounded = unboundedFiles(manifest, files) || [];
    affected = {
      // Two ways to end up with everything: git could not answer at all, or it
      // answered with a file whose blast radius the graph cannot bound. Saying
      // which one it was is the difference between a tool a developer trusts
      // and a tool that just seems slow.
      scope: files === null || unbounded.length ? 'everything' : 'diff',
      reason: files === null ? 'no usable git diff' : unbounded.length ? unbounded : null,
      base: flags.base || null,
      files,
      blocks: [...new Set(stories.map(story => story.block))],
      stories: stories.map(idOf)
    };
  }

  if (flags.json) {
    // The graph is printed as it is defined in contracts.js. An `affected` key
    // rides along only when it was asked for, so a plain `--json` pipe still
    // reads as a BlockGraph.
    console.log(JSON.stringify(affected ? { ...graph, affected } : graph, null, 2));
    return 0;
  }

  for (const line of treeLines(graph)) console.log(line);
  if (graph.nodes.length) console.log('');
  console.log(summary(graph));

  if (graph.cycles.length) {
    console.log('');
    console.log('cycles:');
    for (const cycle of graph.cycles) {
      console.log(`  ${cycle.concat(cycle[0]).join(' -> ')}`);
    }
  }

  if (svgOut) {
    console.log('');
    console.log(`svg: ${path.resolve(root, svgOut)}`);
  }

  if (affected) {
    console.log('');
    if (affected.scope === 'everything' && affected.files === null) {
      console.log('affected: everything (no usable git diff, so nothing is ruled out)');
    } else if (affected.scope === 'everything') {
      const blame = affected.reason.slice(0, 3).map(file => path.relative(root, file));
      const rest = affected.reason.length - blame.length;
      console.log(`affected: everything (changed outside the blocks: ${blame.join(', ')}${rest > 0 ? `, +${rest} more` : ''})`);
    }
    console.log(`affected blocks (${affected.blocks.length}):`);
    for (const tag of affected.blocks) console.log(`  ${tag}`);
    console.log(`affected stories (${affected.stories.length}):`);
    for (const id of affected.stories) console.log(`  ${id}`);
  }

  return 0;
}
