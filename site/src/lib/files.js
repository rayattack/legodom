import { course, lessons } from '../../../docs/learn/course.js';

// Every lesson project, bundled as text. Keys look like
// '../../../docs/learn/basics/state/a/greeting-card.lego'.
const raw = import.meta.glob('../../../docs/learn/*/*/{a,b}/*', { query: '?raw', import: 'default', eager: true });

const projects = {};
for (const [key, text] of Object.entries(raw)) {
  const match = key.match(/learn\/([^/]+)\/([^/]+)\/(a|b)\/([^/]+)$/);
  if (!match) continue;
  const [, chapter, lesson, variant, file] = match;
  const id = `learn/${chapter}/${lesson}`;
  projects[id] = projects[id] || { a: {}, b: {} };
  projects[id][variant][file] = text;
}

/** index.html, then scripts, then blocks: the order a project is read in. */
export const orderFiles = (names) => {
  const rank = (name) => (name === 'index.html' ? 0 : name.endsWith('.js') ? 1 : 2);
  return [...names].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
};

/** @param {string} path - 'learn/<chapter>/<lesson>' */
export const lessonProject = (path) => {
  const project = projects[path];
  if (!project) return null;
  const changed = orderFiles(Object.keys(project.b));
  return {
    start: { ...project.a },
    solved: { ...project.a, ...project.b },
    // Open the file the learner is about to edit.
    open: changed.find(name => name.endsWith('.lego')) || changed[0] || orderFiles(Object.keys(project.a))[0],
    hasSolution: changed.length > 0
  };
};

export const findLesson = (path) => {
  const index = lessons.findIndex(lesson => lesson.path === path);
  if (index === -1) return null;
  return { lesson: lessons[index], index, previous: lessons[index - 1] || null, next: lessons[index + 1] || null };
};

export { course, lessons };
