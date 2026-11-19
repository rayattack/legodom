import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

/**
 * What git says changed.
 *
 * Every command goes through execFile with an argv array. Nothing here is
 * built into a shell string, because a branch name is user input and a branch
 * called `; rm -rf /` is a legal branch name.
 *
 * The return value carries three states, and the middle one is the reason this
 * module exists at all:
 *
 *   null      the question could not be answered, so treat everything as
 *             changed. No repository, no usable base, an unreadable diff, or
 *             an explicit `all`.
 *   []        the repository is clean against the base. Nothing changed.
 *   [paths]   absolute paths, sorted and deduped.
 *
 * Failing to null rather than throwing is deliberate. A studio that cannot
 * reach git should snapshot more than it needs to, never less: silently
 * skipping a story because a git call went sideways is how a tool loses the
 * only thing it is trusted for.
 */

const exec = promisify(execFile);

/** Run git and report failure as data. Exit codes here are answers, not faults. */
const git = async (cwd, args) => {
  try {
    const { stdout } = await exec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: '' };
  }
};

/**
 * Whether a ref exists. `--verify --quiet` turns a missing ref into a silent
 * non zero exit, so there is no stderr noise to filter out of a normal run.
 */
const resolves = async (cwd, ref) => {
  const res = await git(cwd, ['rev-parse', '--verify', '--quiet', ref]);
  return res.ok && res.stdout.trim().length > 0;
};

/**
 * The refs to diff against, in the order a working checkout is likely to want
 * them: the shared branch first, the local copy of it next, and the previous
 * commit as the last resort for a repository that has neither.
 */
const BASE_CANDIDATES = ['origin/main', 'main', 'HEAD~1'];

/**
 * Pick the base. An explicit one that does not resolve is not quietly swapped
 * for a guess: the caller named a comparison and got it wrong, and answering a
 * different question than the one asked is worse than answering none.
 */
const pickBase = async (cwd, base) => {
  if (base) return (await resolves(cwd, base)) ? base : null;
  for (const ref of BASE_CANDIDATES) {
    if (await resolves(cwd, ref)) return ref;
  }
  return null;
};

/** Split git output into absolute paths, sorted and deduped. */
const absolute = (from, chunks) => {
  const out = new Set();
  for (const chunk of chunks) {
    for (const line of String(chunk).split('\n')) {
      const rel = line.trim();
      if (rel) out.add(path.resolve(from, rel));
    }
  }
  return [...out].sort();
};

/**
 * Collect the changed files under `root`.
 *
 * The union is deliberately wide: committed work since the base, unstaged
 * edits, staged edits, and untracked files. A block someone just created and
 * has not added yet is exactly the block they want re-rendered.
 *
 * @param {object} [options]
 * @param {string} [options.root] directory to run git in
 * @param {string} [options.base] ref to diff against
 * @param {boolean} [options.staged] restrict to the staged set
 * @param {boolean} [options.all] skip git entirely and mean everything
 * @returns {Promise<?string[]>} absolute paths, or null for everything
 */
export async function changedFiles({ root, base, staged = false, all = false } = {}) {
  if (all) return null;

  const cwd = path.resolve(root || process.cwd());

  // Paths from `git diff` are relative to the repository root even when git
  // runs in a subdirectory, so resolve against the top level rather than cwd.
  // `ls-files` is asked for the same shape with --full-name, which keeps it
  // scoped to the subtree while reporting the same way.
  const top = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return null;
  const repo = top.stdout.trim();
  if (!repo) return null;

  if (staged) {
    const cached = await git(cwd, ['diff', '--name-only', '--cached']);
    return cached.ok ? absolute(repo, [cached.stdout]) : null;
  }

  const ref = await pickBase(cwd, base);
  if (!ref) return null;

  const chunks = [];

  // A repository with no commits has no HEAD, so there is no range to take.
  // The working tree and the untracked files still answer the question.
  if (await resolves(cwd, 'HEAD')) {
    const range = await git(cwd, ['diff', '--name-only', `${ref}...HEAD`]);
    if (!range.ok) return null;
    chunks.push(range.stdout);
  }

  for (const args of [
    ['diff', '--name-only'],
    ['diff', '--name-only', '--cached'],
    ['ls-files', '--others', '--exclude-standard', '--full-name']
  ]) {
    const res = await git(cwd, args);
    if (!res.ok) return null;
    chunks.push(res.stdout);
  }

  return absolute(repo, chunks);
}
