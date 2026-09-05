import { handleError, guardResult } from '../features/error.js';

export const createBatcher = (renderHandler = null) => {
  let queued = false;
  const blocksToUpdate = new Set();
  let isProcessing = false;
  let _render = renderHandler;

  // FIX: Queue for updates arriving during processing (prevents drops)
  const pendingQueue = new Set();

  // Optimization: Single timer for all updated hooks instead of one per block
  let updatedTimer = null;
  const pendingUpdated = new Set();

  // Resolvers handed out by nextTick(), settled once the batch they are
  // waiting on has finished rendering. `pendingTickResolvers` holds the ones
  // registered while a batch was already in flight: mutations made during
  // that batch land in pendingQueue and render in the *next* one, so those
  // callers must wait for it.
  let tickResolvers = [];
  let pendingTickResolvers = [];

  const setHandler = (fn) => { _render = fn; };

  const scheduleUpdatedHooks = () => {
    // Trailing-only debounce: do NOT reset the timer if it's already pending.
    // Resetting on every batch lets sustained mutation (animations, websockets)
    // starve the hook indefinitely. With this guard, the first batch arms the
    // timer; subsequent batches within the window add to pendingUpdated but
    // the hook still fires within ~50ms of the first update.
    if (updatedTimer) return;
    updatedTimer = setTimeout(() => {
      pendingUpdated.forEach(el => {
        const state = el._studs;
        if (!state || typeof state.updated !== 'function') return;
        try {
          // Both tiers route to the error system: a sync throw here used to
          // be console.error only (invisible to boundaries and to
          // config.onError), and an `async updated()` rejection was not
          // caught at all.
          guardResult(state.updated.call(state), el, 'updated');
        } catch (e) {
          handleError(e, el, 'updated');
        }
      });
      pendingUpdated.clear();
      updatedTimer = null;
    }, 50);
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
    const batch = Array.from(blocksToUpdate);
    blocksToUpdate.clear();
    queued = false;

    // Simple synchronous render loop (faster for small batches, no overhead)
    batch.forEach(el => {
      if (el.isConnected && _render) _render(el);
    });

    // Batch complete: Queue updated hooks efficiently
    batch.forEach(el => pendingUpdated.add(el));
    if (pendingUpdated.size > 0) scheduleUpdatedHooks();
    isProcessing = false;

    // FIX: Process pending queue after batch completes
    processPendingQueue();

    // The DOM for this batch is committed. Waiters resolve now; they do not
    // wait out the updated() debounce.
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
     * Resolves after the next flush commits its DOM writes. If nothing is
     * queued, an empty batch is scheduled so the promise still settles on
     * the next animation frame rather than hanging.
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
