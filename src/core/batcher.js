import { handleError, guardResult } from '../features/error.js';

// A flush keeps draining until nothing new is queued. A parent writing a
// child's prop schedules the child from inside the parent's own render, and
// a wave like that has to reach the DOM in the frame it started in, not the
// one after. The cap is a stop for a binding that writes what it reads: that
// is a bug in the block, and the warning says so rather than locking up the
// main thread.
const MAX_FLUSH_PASSES = 100;

export const createBatcher = (renderHandler = null) => {
  let queued = false;
  const blocksToUpdate = new Set();
  let isProcessing = false;
  let _render = renderHandler;

  // FIX: Queue for updates arriving during processing (prevents drops)
  const pendingQueue = new Set();

  // Resolvers handed out by nextTick(), settled once the batch they are
  // waiting on has finished rendering. `pendingTickResolvers` holds the ones
  // registered while a batch was already in flight: mutations made during
  // that batch land in pendingQueue and render in the *next* one, so those
  // callers must wait for it.
  let tickResolvers = [];
  let pendingTickResolvers = [];

  const setHandler = (fn) => { _render = fn; };

  /**
   * Invoke a lifecycle hook on a block. Both tiers route to the error system:
   * a sync throw here would otherwise be console-only (invisible to
   * boundaries and to config.onError), and an `async` hook's rejection would
   * not be caught at all.
   */
  const callHook = (el, hookName) => {
    const state = el._studs;
    if (!state || typeof state[hookName] !== 'function') return;
    try {
      guardResult(state[hookName].call(state), el, hookName);
    } catch (e) {
      handleError(e, el, hookName);
    }
  };

  const renderPass = (batch, rendered) => {
    batch.forEach(el => {
      if (!el.isConnected || !_render) return;
      // beforeUpdate sees the DOM this render is about to overwrite. It never
      // fires for the first render, which snap() drives directly rather than
      // through a batch.
      callHook(el, 'beforeUpdate');
      _render(el);
      rendered.add(el);
    });
  };

  const processPendingQueue = () => {
    if (pendingQueue.size > 0) {
      // Move pending to main queue
      pendingQueue.forEach(el => blocksToUpdate.add(el));
      pendingQueue.clear();

      // Trigger next batch if not already queued
      if (!queued && blocksToUpdate.size > 0) {
        queued = true;
        requestAnimationFrame(processBatch);
      }
    }
  };

  const resolveTicks = () => {
    if (tickResolvers.length === 0) return;
    // Swap the list first: a resolver's continuation may call nextTick()
    // again, and those waiters belong to the *next* batch.
    const waiting = tickResolvers;
    tickResolvers = [];
    waiting.forEach(resolve => resolve());
  };

  const processBatch = () => {
    isProcessing = true;
    const rendered = new Set();
    let passes = 0;

    while (blocksToUpdate.size > 0 && passes < MAX_FLUSH_PASSES) {
      passes++;
      const batch = Array.from(blocksToUpdate);
      blocksToUpdate.clear();
      renderPass(batch, rendered);
      // Work scheduled during the pass (a child that just received a prop)
      // is promoted into this same flush so the wave settles in one frame.
      pendingQueue.forEach(el => blocksToUpdate.add(el));
      pendingQueue.clear();
    }
    const stalled = blocksToUpdate.size > 0;
    if (stalled) {
      console.warn('[Lego] Render flush hit its pass limit: a binding is writing state that it also reads.');
    }
    queued = false;

    // updated() is synchronous: by the time it runs, every render in this
    // flush has committed, so a block can measure its own DOM. Once per
    // element per flush, however many passes it took.
    rendered.forEach(el => callHook(el, 'updated'));
    isProcessing = false;

    // FIX: Process pending queue after batch completes (updated() hooks that
    // mutate state land here, and render on the next frame).
    processPendingQueue();
    if (stalled && !queued) {
      queued = true;
      requestAnimationFrame(processBatch);
    }

    // The DOM for this batch is committed and its hooks have run.
    resolveTicks();

    // Promote anyone who called nextTick() mid-batch, and make sure a batch
    // is scheduled for them even if nothing else is queued.
    if (pendingTickResolvers.length > 0) {
      tickResolvers = tickResolvers.concat(pendingTickResolvers);
      pendingTickResolvers = [];
      if (!queued) {
        queued = true;
        requestAnimationFrame(processBatch);
      }
    }
  };

  return {
    add: (el) => {
      if (!el) return;

      // FIX: Queue during processing instead of dropping
      if (isProcessing) {
        pendingQueue.add(el);
        return;
      }

      blocksToUpdate.add(el);
      if (queued) return;
      queued = true;

      requestAnimationFrame(processBatch);
    },
    /**
     * Resolves after the next flush commits its DOM writes and runs its
     * `updated()` hooks. If nothing is queued, an empty batch is scheduled so
     * the promise still settles on the next animation frame rather than
     * hanging.
     * @returns {Promise<void>}
     */
    nextTick: () => new Promise(resolve => {
      // Called from inside a render or an updated() hook: the DOM this
      // caller is waiting on may be produced by the follow-up batch that
      // drains pendingQueue, so defer to that one.
      if (isProcessing) {
        pendingTickResolvers.push(resolve);
        return;
      }
      tickResolvers.push(resolve);
      if (queued) return;
      queued = true;
      requestAnimationFrame(processBatch);
    }),
    setHandler
  };
};

export const globalBatcher = createBatcher();
