import { describe, it, expect } from 'vitest';
import { buildGraph, topoOrder } from '../src/graph/build.js';
import { graphToSVG } from '../src/graph/svg.js';
import { storyId } from '../src/core/contracts.js';

/**
 * Manifests here are built by hand. The scanner is another module's job and
 * another module's tests; what this file cares about is the shape the graph
 * takes for a given set of `children` lists.
 */
const block = (tag, children = []) => ({
  tag,
  file: `/app/${tag}.lego`,
  relFile: `${tag}.lego`,
  shadow: true,
  form: false,
  template: '',
  css: '',
  script: '',
  propsAttr: '',
  props: [],
  stateKeys: [],
  methodKeys: [],
  emits: [],
  slots: [],
  children,
  storyFiles: [],
  stories: [{
    id: storyId(tag, 'Default'),
    block: tag,
    name: 'Default',
    args: {},
    slots: {},
    globals: {},
    route: null,
    source: 'implicit'
  }]
});

const manifest = (blocks, root = '/app') => ({
  root,
  blocks: Object.fromEntries(blocks.map(b => [b.tag, b])),
  order: blocks.map(b => b.tag).sort(),
  errors: []
});

/** page-home -> user-card -> ui-button -> icon-glyph */
const chain = () => manifest([
  block('page-home', ['user-card']),
  block('user-card', ['ui-button']),
  block('ui-button', ['icon-glyph']),
  block('icon-glyph')
]);

describe('buildGraph', () => {
  it('takes its nodes from the manifest order', () => {
    const graph = buildGraph(chain());
    expect(graph.nodes).toEqual(['icon-glyph', 'page-home', 'ui-button', 'user-card']);
  });

  it('builds one sorted, deduped edge per composed tag', () => {
    const graph = buildGraph(manifest([
      block('page-home', ['ui-button', 'ui-button', 'user-card']),
      block('user-card', ['ui-button']),
      block('ui-button')
    ]));
    expect(graph.edges).toEqual([
      ['page-home', 'ui-button'],
      ['page-home', 'user-card'],
      ['user-card', 'ui-button']
    ]);
  });

  it('drops children that are not blocks', () => {
    const graph = buildGraph(manifest([
      block('page-home', ['ui-button', 'some-widget', 'lego-router'])
    ]));
    expect(graph.edges).toEqual([]);
    expect(graph.dependencies['page-home']).toEqual([]);
  });

  it('reports transitive dependencies and dependents over a four level chain', () => {
    const graph = buildGraph(chain());
    expect(graph.dependencies['page-home']).toEqual(['icon-glyph', 'ui-button', 'user-card']);
    expect(graph.dependents['icon-glyph']).toEqual(['page-home', 'ui-button', 'user-card']);
    expect(graph.dependents['page-home']).toEqual([]);
    expect(graph.dependencies['icon-glyph']).toEqual([]);
  });

  it('never lists a tag among its own dependencies or dependents', () => {
    const graph = buildGraph(manifest([
      block('tree-node', ['tree-node']),
      block('page-home', ['tree-node'])
    ]));
    expect(graph.dependencies['tree-node']).toEqual([]);
    expect(graph.dependents['tree-node']).toEqual(['page-home']);
  });

  it('is stable across runs', () => {
    expect(buildGraph(chain())).toEqual(buildGraph(chain()));
  });

  it('works from blocks alone when the manifest has no order', () => {
    const m = chain();
    delete m.order;
    expect(buildGraph(m).nodes).toEqual(['icon-glyph', 'page-home', 'ui-button', 'user-card']);
  });

  it('survives an empty manifest', () => {
    const graph = buildGraph({ root: '/app', blocks: {}, order: [], errors: [] });
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.cycles).toEqual([]);
    expect(topoOrder(graph)).toEqual([]);
  });
});

describe('cycles', () => {
  it('records a two node cycle once, starting at the smallest tag', () => {
    const graph = buildGraph(manifest([
      block('comment-item', ['comment-list']),
      block('comment-list', ['comment-item'])
    ]));
    expect(graph.cycles).toEqual([['comment-item', 'comment-list']]);
  });

  it('records the same cycle once however it is entered', () => {
    const graph = buildGraph(manifest([
      block('page-home', ['comment-list', 'comment-item']),
      block('comment-item', ['comment-list']),
      block('comment-list', ['comment-item'])
    ]));
    expect(graph.cycles).toEqual([['comment-item', 'comment-list']]);
  });

  it('records a self edge as a one node cycle', () => {
    const graph = buildGraph(manifest([
      block('tree-node', ['tree-leaf', 'tree-node']),
      block('tree-leaf')
    ]));
    expect(graph.cycles).toEqual([['tree-node']]);
    expect(graph.edges).toContainEqual(['tree-node', 'tree-node']);
  });

  it('closes the transitive sets over a cycle without looping', () => {
    const graph = buildGraph(manifest([
      block('comment-item', ['comment-list']),
      block('comment-list', ['comment-item']),
      block('page-home', ['comment-list'])
    ]));
    expect(graph.dependencies['comment-list']).toEqual(['comment-item']);
    expect(graph.dependents['comment-item']).toEqual(['comment-list', 'page-home']);
    expect(graph.dependents['comment-list']).toEqual(['comment-item', 'page-home']);
  });

  it('handles a cycle with no entry point at all', () => {
    const graph = buildGraph(manifest([
      block('a-one', ['b-two']),
      block('b-two', ['c-three']),
      block('c-three', ['a-one'])
    ]));
    expect(graph.cycles).toEqual([['a-one', 'b-two', 'c-three']]);
    expect(topoOrder(graph).slice().sort()).toEqual(['a-one', 'b-two', 'c-three']);
  });
});

describe('topoOrder', () => {
  it('puts every child before the parent that renders it', () => {
    const graph = buildGraph(chain());
    const order = topoOrder(graph);
    expect(order).toEqual(['icon-glyph', 'ui-button', 'user-card', 'page-home']);
    for (const [parent, child] of graph.edges) {
      expect(order.indexOf(child)).toBeLessThan(order.indexOf(parent));
    }
  });

  it('returns every node exactly once when cycles are present', () => {
    const graph = buildGraph(manifest([
      block('comment-item', ['comment-list']),
      block('comment-list', ['comment-item']),
      block('page-home', ['comment-list']),
      block('tree-node', ['tree-node'])
    ]));
    const order = topoOrder(graph);
    expect(order.slice().sort()).toEqual(['comment-item', 'comment-list', 'page-home', 'tree-node']);
    expect(new Set(order).size).toBe(order.length);
  });

  it('breaks a cycle at the same place every time', () => {
    const build = () => topoOrder(buildGraph(manifest([
      block('comment-item', ['comment-list']),
      block('comment-list', ['comment-item'])
    ])));
    expect(build()).toEqual(build());
    // The cycle is cut at the edge pointing back at the smallest tag, so the
    // other member has to settle first.
    expect(build()).toEqual(['comment-list', 'comment-item']);
  });

  it('covers a disconnected forest', () => {
    const graph = buildGraph(manifest([
      block('page-home', ['ui-button']),
      block('ui-button'),
      block('page-about', ['ui-badge']),
      block('ui-badge'),
      block('lonely-block')
    ]));
    expect(topoOrder(graph).slice().sort()).toEqual([
      'lonely-block', 'page-about', 'page-home', 'ui-badge', 'ui-button'
    ]);
    for (const [parent, child] of graph.edges) {
      const order = topoOrder(graph);
      expect(order.indexOf(child)).toBeLessThan(order.indexOf(parent));
    }
  });
});

describe('graphToSVG', () => {
  const cases = {
    'one node': manifest([block('ui-button')]),
    'no edges': manifest([block('ui-button'), block('ui-badge'), block('ui-input')]),
    'a chain': chain(),
    'a disconnected forest': manifest([
      block('page-home', ['ui-button']),
      block('ui-button'),
      block('page-about', ['ui-badge']),
      block('ui-badge'),
      block('lonely-block')
    ]),
    'a two node cycle': manifest([
      block('comment-item', ['comment-list']),
      block('comment-list', ['comment-item'])
    ]),
    'a self edge': manifest([block('tree-node', ['tree-node'])]),
    'a cycle with no root': manifest([
      block('a-one', ['b-two']),
      block('b-two', ['a-one']),
      block('c-three', ['a-one'])
    ])
  };

  for (const [label, m] of Object.entries(cases)) {
    it(`emits NaN free svg for ${label}`, () => {
      const svg = graphToSVG(buildGraph(m), { manifest: m });
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      for (const tag of m.order) expect(svg).toContain(`>${tag}</text>`);
    });
  }

  it('emits NaN free svg for an empty graph', () => {
    const svg = graphToSVG(buildGraph({ root: '/app', blocks: {}, order: [], errors: [] }));
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('No blocks');
  });

  it('reads on both backgrounds', () => {
    const svg = graphToSVG(buildGraph(chain()));
    expect(svg).toContain('prefers-color-scheme: dark');
  });

  it('marks a recursive block distinctly', () => {
    const svg = graphToSVG(buildGraph(manifest([block('tree-node', ['tree-node'])])));
    expect(svg).toContain('cycle');
    expect(svg).toContain('edge self');
  });

  it('is byte identical for the same graph', () => {
    const m = chain();
    expect(graphToSVG(buildGraph(m), { manifest: m })).toBe(graphToSVG(buildGraph(m), { manifest: m }));
  });

  it('honours a minimum width without distorting the layout', () => {
    const wide = graphToSVG(buildGraph(chain()), { width: 900 });
    expect(wide).toContain('width="900"');
    expect(wide).not.toContain('NaN');
  });

  it('wraps a wide layer instead of drawing one endless row', () => {
    const many = manifest(Array.from({ length: 24 }, (_, i) => block(`ui-block-${i + 10}`)));
    const svg = graphToSVG(buildGraph(many), { manifest: many });
    const width = Number(/width="([\d.]+)"/.exec(svg)[1]);
    const height = Number(/height="([\d.]+)"/.exec(svg)[1]);
    expect(width).toBeLessThanOrEqual(1260);
    expect(height).toBeGreaterThan(120);
    expect(svg).not.toContain('NaN');
  });

  it('escapes anything that would break the markup', () => {
    const svg = graphToSVG({ nodes: ['a<b&c'], edges: [], dependents: {}, dependencies: {}, cycles: [] });
    expect(svg).toContain('a&lt;b&amp;c');
    expect(svg).not.toContain('NaN');
  });
});
