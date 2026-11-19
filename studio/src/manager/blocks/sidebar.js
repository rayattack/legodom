/**
 * lego-studio-sidebar: the block and story tree.
 *
 * The tree is flattened into a single list of rows by a getter, which the
 * template renders with one `b-for`. Flat rather than nested for two
 * reasons: a keyed single-level loop is the cheapest thing the renderer can
 * do with a list that changes on every keystroke, and event handlers inside
 * a *nested* b-for cannot currently resolve their outer loop variable (the
 * handler re-evaluates the inner list expression against the block's own
 * state, where the outer item name does not exist). Flattening sidesteps
 * that, and it is a better fit for a tree anyway: depth is a number, not a
 * DOM nesting level.
 *
 * The badges are the reason this panel is worth more than a list of names.
 * A block that renders into the light DOM and a block that is form
 * associated behave differently enough that knowing which one you are
 * looking at saves an hour of debugging a style that will not apply, and
 * the manifest already knows.
 */

import { Lego } from 'lego-dom';

/** The directory a block's relFile sits in, which is how the tree groups. */
const dirOf = (relFile) => {
  const path = String(relFile || '').replace(/\\/g, '/');
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '.' : path.slice(0, cut);
};

const matches = (needle, tag, storyName) =>
  !needle ||
  tag.toLowerCase().includes(needle) ||
  String(storyName).toLowerCase().includes(needle);

const template = `
<style>
  :host {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    background: var(--bg-raised);
    color: var(--fg);
    font: var(--font-ui);
  }
  .search {
    padding: var(--gap-2) var(--gap-3);
    border-bottom: 1px solid var(--line);
  }
  .filter {
    width: 100%;
    box-sizing: border-box;
    appearance: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--fg);
    font: inherit;
    padding: 6px var(--gap-2);
    transition: border-color var(--tr);
  }
  .filter:hover { border-color: var(--fg-faint); }
  /*
   * Offset rather than inset. A 1px rule sitting just outside the control is
   * the whole focus treatment here, so it has to be clear of the control's
   * own border or the two read as one thick edge.
   */
  .filter:focus-visible {
    outline: 1px solid var(--fg);
    outline-offset: 2px;
    border-color: var(--fg);
  }
  .filter::placeholder { color: var(--fg-faint); }
  .tree {
    overflow: auto;
    padding-bottom: var(--gap-3);
  }
  .group {
    padding: var(--gap-3) var(--gap-3) 4px;
    color: var(--fg-faint);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    box-sizing: border-box;
    appearance: none;
    border: 0;
    border-left: 2px solid transparent;
    background: none;
    color: var(--fg-dim);
    font: inherit;
    text-align: left;
    padding: 4px var(--gap-3);
    cursor: pointer;
    transition: background-color var(--tr), color var(--tr), border-color var(--tr);
  }
  .item:hover { background: var(--bg-hover); color: var(--fg); }
  .item:focus-visible { outline: 1px solid var(--fg); outline-offset: -2px; }
  .item.block { color: var(--fg); padding-left: var(--gap-3); }
  /* Lines the story label up under the block label, past twist plus gap. */
  .item.story { padding-left: 28px; }
  /*
   * Selection with no tint to spend. A surface one step up from the panel,
   * a solid rule down the left edge and the label at full strength and 500,
   * which is three signals where the old blue background was one.
   */
  .item.is-selected {
    background: var(--accent-bg);
    border-left-color: var(--accent);
    color: var(--fg);
    font-weight: 500;
  }
  .twist {
    width: 10px;
    color: var(--fg-faint);
    font-size: 10px;
  }
  .label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item.block .label { font-family: var(--font-mono); font-size: var(--fs-xs); }
  .count {
    color: var(--fg-faint);
    font-variant-numeric: tabular-nums;
  }
  /*
   * These two used to be a purple chip and an amber one. With the hue gone
   * they separate by construction: "light" is barely filled and bordered in
   * mid gray, "form" is a step darker on all three of fill, border and type
   * weight. The words themselves were always doing the real work, so nothing
   * went with the colour, but a glance still tells the two apart.
   */
  .badge {
    padding: 0 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .badge.light {
    border-color: var(--tint-line);
    background: var(--tint-bg);
    color: var(--tint-fg);
  }
  .badge.form {
    border-color: var(--warn-line);
    background: var(--warn-bg);
    color: var(--warn-fg);
    font-weight: 500;
  }
  .none { padding: var(--gap-4) var(--gap-3); color: var(--fg-dim); }
</style>
<div class="search">
  <input class="filter" type="search" autocomplete="off" spellcheck="false"
    placeholder="Filter blocks and stories"
    b-sync="filter"
    @input="onFilter($event.target.value)">
</div>
<div class="tree" role="tree">
  <div b-for="row in rows" b-key="id" class="node">
    <div class="group" b-if="row.kind === 'group'">[[ row.label ]]</div>
    <button type="button" b-if="row.kind !== 'group'"
      class="item [[ row.kind ]] [[ row.selected ? 'is-selected' : '' ]]"
      @click="pick(row)">
      <span class="twist" b-if="row.kind === 'block'">[[ row.open ? '▾' : '▸' ]]</span>
      <span class="label">[[ row.label ]]</span>
      <span class="badge light" b-if="row.light" title="Renders into the light DOM">light</span>
      <span class="badge form" b-if="row.form" title="Form associated block">form</span>
      <span class="count" b-if="row.kind === 'block'">[[ row.count ]]</span>
    </button>
  </div>
  <div class="none" b-if="rows.length === 0">[[ emptyMessage ]]</div>
</div>
`;

const logic = {
  /** Explicit expand/collapse decisions, keyed by tag. Absent means "auto". */
  open: {},

  /**
   * The tree, flattened. A computed, so a keystroke in the filter box
   * recomputes it once and the b-for reconciles by key, rather than every
   * handler rebuilding the list by hand.
   */
  get rows() {
    const manifest = this.manifest || {};
    const blocks = manifest.blocks || {};
    const order = manifest.order || [];
    const needle = String(this.filter || '').trim().toLowerCase();
    const selected = this.selected;

    const groups = new Map();
    order.forEach(tag => {
      const info = blocks[tag];
      if (!info) return;
      const stories = (info.stories || []).filter(s => matches(needle, tag, s.name));
      // Without a filter a story-less block still belongs in the tree; with
      // one, a block whose stories all failed to match is not a result.
      if (needle && stories.length === 0) return;
      const dir = dirOf(info.relFile);
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir).push({ info, stories });
    });

    const rows = [];
    [...groups.keys()].sort().forEach(dir => {
      rows.push({ id: `g:${dir}`, kind: 'group', label: dir, depth: 0 });
      groups.get(dir).forEach(({ info, stories }) => {
        const holdsSelection = stories.some(s => s.id === selected);
        // Filtering is itself an expansion request: a search that matched a
        // story name is useless if the story stays folded away.
        const auto = !!needle || holdsSelection;
        const open = info.tag in this.open ? !!this.open[info.tag] : auto;
        rows.push({
          id: `b:${info.tag}`,
          kind: 'block',
          label: info.tag,
          tag: info.tag,
          depth: 1,
          open,
          light: info.shadow === false,
          form: info.form === true,
          count: stories.length,
          selected: false
        });
        if (!open) return;
        stories.forEach(story => rows.push({
          id: `s:${story.id}`,
          kind: 'story',
          label: story.name,
          storyId: story.id,
          tag: info.tag,
          depth: 2,
          selected: story.id === selected,
          light: false,
          form: false
        }));
      });
    });
    return rows;
  },

  get emptyMessage() {
    if (String(this.filter || '').trim()) return 'Nothing matches that filter.';
    return 'No blocks discovered yet.';
  },

  pick(row) {
    if (row.kind === 'block') {
      this.open = Object.assign({}, this.open, { [row.tag]: !row.open });
      return;
    }
    if (row.kind === 'story') this.$emit('story-pick', row.storyId);
  },

  onFilter(value) {
    this.$emit('filter-set', String(value || ''));
  }
};

Lego.block('lego-studio-sidebar', {
  template,
  logic,
  props: 'manifest: Object = {}, selected: String = "", filter: String = ""'
});
