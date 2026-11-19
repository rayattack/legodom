/**
 * The interactive tutorial's table of contents.
 *
 * Each lesson lives at docs/learn/<chapter>/<lesson>.md, with its project in
 * the folder of the same name: `a/` holds the files the learner starts with
 * and `b/` holds only the files that differ in the solution.
 *
 * Imported by the docs theme and by tests/learn-lessons.test.js, so keep it
 * free of imports.
 */
export const course = [
  {
    slug: 'basics',
    title: 'Basics',
    color: 'yellow',
    summary: 'Define a block, give it state, respond to a click.',
    lessons: [
      { slug: 'hello-blocks', title: 'Your first block' },
      { slug: 'state', title: 'Adding state' },
      { slug: 'expressions', title: 'Expressions' },
      { slug: 'events', title: 'Handling events' },
      { slug: 'styles', title: 'Scoped styles' }
    ]
  },
  {
    slug: 'reactivity',
    title: 'Reactivity',
    color: 'red',
    summary: 'Methods, derived values, deep state and watchers.',
    lessons: [
      { slug: 'methods', title: 'Methods' },
      { slug: 'getters', title: 'Derived values' },
      { slug: 'deep-state', title: 'Objects and arrays' },
      { slug: 'watchers', title: 'Watching for changes' }
    ]
  },
  {
    slug: 'directives',
    title: 'Directives',
    color: 'blue',
    summary: 'Conditionals, lists, form inputs and key handling.',
    lessons: [
      { slug: 'conditionals', title: 'Showing and hiding' },
      { slug: 'lists', title: 'Rendering lists' },
      { slug: 'forms', title: 'Form inputs' },
      { slug: 'modifiers', title: 'Event modifiers' }
    ]
  },
  {
    slug: 'composition',
    title: 'Composition',
    color: 'green',
    summary: 'Nest blocks and move data between them.',
    lessons: [
      { slug: 'nesting', title: 'Blocks inside blocks' },
      { slug: 'props', title: 'Passing props' },
      { slug: 'events-up', title: 'Events from children' },
      { slug: 'slots', title: 'Slots' },
      { slug: 'globals', title: 'Shared state' }
    ]
  },
  {
    slug: 'beyond',
    title: 'Beyond',
    color: 'ink',
    summary: 'Persistence, lifecycle hooks and dynamic blocks.',
    lessons: [
      { slug: 'persistence', title: 'Remembering state' },
      { slug: 'lifecycle', title: 'Lifecycle hooks' },
      { slug: 'dynamic-blocks', title: 'Dynamic blocks' },
      { slug: 'next-steps', title: 'Where to go next' }
    ]
  }
];

/** Every lesson in order, with its chapter and its position. */
export const lessons = course.flatMap((chapter, chapterIndex) =>
  chapter.lessons.map((lesson, lessonIndex) => ({
    ...lesson,
    chapter: chapter.slug,
    chapterTitle: chapter.title,
    color: chapter.color,
    chapterIndex,
    lessonIndex,
    path: `learn/${chapter.slug}/${lesson.slug}`
  }))
);
