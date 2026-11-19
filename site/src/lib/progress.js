import { Lego } from 'lego-dom';

// Which lessons the reader has finished. It lives on Lego.globals, so every
// block that shows a tick reads the same reactive array, and in localStorage,
// so it is still there next visit.
const KEY = 'legodom.learn.done';

export const loadProgress = () => {
  let saved = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    if (Array.isArray(parsed)) saved = parsed.filter(item => typeof item === 'string');
  } catch (e) { /* storage unavailable or malformed: start empty */ }
  Lego.globals.done = saved;
};

export const markDone = (path) => {
  if (Lego.globals.done.includes(path)) return;
  Lego.globals.done.push(path);
  try { window.localStorage.setItem(KEY, JSON.stringify([...Lego.globals.done])); } catch (e) { /* private mode */ }
};
