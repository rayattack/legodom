/**
 * A line diff, in unified format.
 *
 * A snapshot that changed is only useful if the change is legible, and
 * "expected 4kb of HTML, got 4kb of HTML" is not legible. This produces the
 * same shape `git diff` does, so the output reads the way a reviewer already
 * expects markup changes to read.
 *
 * Zero dependencies, like the framework it ships with, so the algorithm is
 * here in full: longest common subsequence over lines, then hunks assembled
 * around the runs that differ.
 */

/**
 * Above this many cells the quadratic table stops being worth building. Two
 * files that large and that different are better described as one wholesale
 * replacement than as a thousand interleaved edits nobody will read.
 */
const MAX_CELLS = 4_000_000;

/**
 * Split into lines for comparison. One trailing newline is dropped first: it
 * terminates the last line rather than starting an empty one, and keeping it
 * would show a phantom final line in every diff.
 */
const toLines = (value) => {
  const text = String(value == null ? '' : value);
  if (text === '') return [];
  return text.replace(/\n$/, '').split('\n');
};

const op = (type, line) => ({ type, line });

/**
 * Longest common subsequence, as an edit script. The table holds the length
 * of the best subsequence from each position onwards, so the walk back out of
 * it runs forwards and emits operations already in order.
 *
 * At a replacement the deletion is emitted before the insertion, which is
 * what unified format expects and what every diff reader is tuned to see.
 */
const lcsOps = (a, b) => {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((line) => op('ins', line));
  if (m === 0) return a.map((line) => op('del', line));
  if (n * m > MAX_CELLS) {
    return a.map((line) => op('del', line)).concat(b.map((line) => op('ins', line)));
  }

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push(op('eq', a[i]));
      i++;
      j++;
      continue;
    }
    if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push(op('del', a[i]));
      i++;
      continue;
    }
    ops.push(op('ins', b[j]));
    j++;
  }
  while (i < n) ops.push(op('del', a[i++]));
  while (j < m) ops.push(op('ins', b[j++]));
  return ops;
};

/**
 * The edit script for two line lists. The shared head and tail are matched off
 * first so the quadratic part only ever sees the region that actually differs,
 * which for a snapshot is usually a handful of lines out of hundreds.
 */
const diffOps = (a, b) => {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tailA = a.length;
  let tailB = b.length;
  while (tailA > head && tailB > head && a[tailA - 1] === b[tailB - 1]) {
    tailA--;
    tailB--;
  }

  const ops = [];
  for (let i = 0; i < head; i++) ops.push(op('eq', a[i]));
  ops.push(...lcsOps(a.slice(head, tailA), b.slice(head, tailB)));
  for (let i = tailA; i < a.length; i++) ops.push(op('eq', a[i]));
  return ops;
};

/**
 * Number every operation with the line it occupies on each side, which is
 * what a hunk header reports.
 */
const numbered = (ops) => {
  let oldNo = 0;
  let newNo = 0;
  return ops.map((entry) => {
    if (entry.type === 'eq') return { ...entry, oldNo: ++oldNo, newNo: ++newNo };
    if (entry.type === 'del') return { ...entry, oldNo: ++oldNo, newNo };
    return { ...entry, oldNo, newNo: ++newNo };
  });
};

/**
 * Group changed rows into hunks, each padded with `context` unchanged rows.
 * Two hunks whose contexts touch become one, because printing the same line
 * twice under two headers is worse than printing one slightly larger hunk.
 */
const hunksFor = (rows, context) => {
  const hunks = [];
  let current = null;
  rows.forEach((row, index) => {
    if (row.type === 'eq') return;
    const from = Math.max(0, index - context);
    const to = Math.min(rows.length - 1, index + context);
    if (current && from <= current.to + 1) {
      current.to = Math.max(current.to, to);
      return;
    }
    current = { from, to };
    hunks.push(current);
  });
  return hunks;
};

const MARKERS = { eq: ' ', del: '-', ins: '+' };

/**
 * Diff two texts line by line.
 *
 * @param {string} expected - the left side, what was on disk
 * @param {string} actual - the right side, what was rendered
 * @param {object} [options]
 * @param {number} [options.context=3] - unchanged lines shown around a change
 * @returns {string} a unified diff, or '' when the two texts match
 */
export function unifiedDiff(expected, actual, { context = 3 } = {}) {
  const a = toLines(expected);
  const b = toLines(actual);
  const ops = diffOps(a, b);
  if (!ops.some((entry) => entry.type !== 'eq')) return '';

  const rows = numbered(ops);
  const out = [];

  hunksFor(rows, Math.max(0, context)).forEach((hunk) => {
    const slice = rows.slice(hunk.from, hunk.to + 1);
    const oldRows = slice.filter((row) => row.type !== 'ins');
    const newRows = slice.filter((row) => row.type !== 'del');
    // A hunk that only inserts has no old lines, and unified format reports
    // the start of an empty range as 0 rather than as the line after it.
    const oldStart = oldRows.length ? oldRows[0].oldNo : 0;
    const newStart = newRows.length ? newRows[0].newNo : 0;
    out.push(`@@ -${oldStart},${oldRows.length} +${newStart},${newRows.length} @@`);
    slice.forEach((row) => out.push(MARKERS[row.type] + row.line));
  });

  return out.join('\n');
}
