import { describe, it, expect, vi } from 'vitest';
import { createBatcher } from '../src/core/batcher.js';

/**
 * Every scheduling path in the batcher sets `queued` before it asks for an
 * animation frame, and `requestAnimationFrame` does not fire while a document
 * is hidden. A tab backgrounded at the wrong moment therefore stopped
 * rendering, and `nextTick()` stopped settling, so an `await Lego.nextTick()`
 * anywhere in application code deadlocked.
 *
 * The timer backstop only has to win when no frame is coming. These tests
 * drive both halves directly: a `requestAnimationFrame` that never calls back
 * stands in for a hidden tab, and a normal one proves the timer stays out of
 * the way when frames are arriving.
 */
describe('batcher without animation frames', () => {
  const withRaf = async (raf, body) => {
    const original = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = raf;
    try {
      return await body();
    } finally {
      if (original) globalThis.requestAnimationFrame = original;
      else delete globalThis.requestAnimationFrame;
    }
  };

  it('still renders when no frame ever arrives', async () => {
    vi.useFakeTimers();
    const rendered = [];
    await withRaf(() => 0, async () => {
      const batcher = createBatcher(el => rendered.push(el));
      batcher.add({ isConnected: true, tagName: 'X-A' });

      expect(rendered).toHaveLength(0);
      vi.advanceTimersByTime(200);
      expect(rendered).toHaveLength(1);
    });
    vi.useRealTimers();
  });

  it('still settles nextTick when no frame ever arrives', async () => {
    const settled = await withRaf(() => 0, async () => {
      const batcher = createBatcher(() => {});
      return Promise.race([
        batcher.nextTick().then(() => 'settled'),
        new Promise(resolve => setTimeout(() => resolve('hung'), 1000))
      ]);
    });
    expect(settled).toBe('settled');
  });

  it('accepts new work again after a frameless flush', async () => {
    const rendered = [];
    await withRaf(() => 0, async () => {
      const batcher = createBatcher(el => rendered.push(el));
      batcher.add({ isConnected: true, tagName: 'X-A' });
      await batcher.nextTick();
      batcher.add({ isConnected: true, tagName: 'X-B' });
      await batcher.nextTick();
    });
    expect(rendered.map(el => el.tagName)).toEqual(['X-A', 'X-B']);
  });

  it('renders exactly once when the frame arrives first', async () => {
    vi.useFakeTimers();
    const rendered = [];
    const frames = [];
    await withRaf((cb) => { frames.push(cb); return frames.length; }, async () => {
      const batcher = createBatcher(el => rendered.push(el));
      batcher.add({ isConnected: true, tagName: 'X-A' });

      // The frame lands well before the backstop would.
      frames.forEach(cb => cb());
      expect(rendered).toHaveLength(1);

      // The backstop must not run the same batch a second time.
      vi.advanceTimersByTime(500);
      expect(rendered).toHaveLength(1);
    });
    vi.useRealTimers();
  });

  it('falls back to a timer where there is no requestAnimationFrame at all', async () => {
    const original = globalThis.requestAnimationFrame;
    delete globalThis.requestAnimationFrame;
    try {
      const batcher = createBatcher(() => {});
      await batcher.nextTick();
    } finally {
      if (original) globalThis.requestAnimationFrame = original;
    }
  });
});
