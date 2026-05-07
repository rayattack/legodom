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
        if (state && typeof state.updated === 'function') {
          try { state.updated.call(state); } catch (e) { console.error(`[Lego] Error in updated hook:`, e); }
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
    scheduleUpdatedHooks();
    isProcessing = false;

    // FIX: Process pending queue after batch completes
    processPendingQueue();
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
    setHandler
  };
};

export const globalBatcher = createBatcher();
