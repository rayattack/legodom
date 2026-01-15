/**
 * LegoDOM Monitoring Plugin
 * Tracks render performance and errors.
 */

export const Monitoring = {
  // Metrics storage
  metrics: {
    renders: 0,
    errors: 0,
    slowRenders: 0,
    components: new Map(), // tagName -> { count, avgTime }
  },

  // Configuration options
  options: {
    slowRenderThreshold: 16, // ms (target 60fps)
    reportToConsole: false,
    reportUrl: null // Endpoint to send metrics to
  },

  /**
   * Install the plugin
   * @param {object} Lego - The global Lego object
   * @param {object} opts - Configuration options
   */
  install(Lego, opts = {}) {
    Object.assign(this.options, opts);

    // Prevent double installation
    if (Lego.metrics) {
      // Just reset metrics if re-installing
      if (Lego.metrics.reset) Lego.metrics.reset();
      return;
    }

    // Ensure metrics object exists on config if not already
    if (!Lego.config.metrics) Lego.config.metrics = {};

    // 1. Hook into Render Cycle
    Lego.config.metrics.onRenderStart = (el) => {
      if (!el.__perfId) el.__perfId = Math.random().toString(36).substr(2, 9);
      performance.mark(`lego-render-start-${el.__perfId}`);
    };

    Lego.config.metrics.onRenderEnd = (el) => {
      const id = el.__perfId;
      const startMark = `lego-render-start-${id}`;
      const measureName = `lego-render-${el.tagName}-${id}`;

      try {
        performance.measure(measureName, startMark);
        const entry = performance.getEntriesByName(measureName).pop();
        if (entry) {
          this.recordMetric(el.tagName.toLowerCase(), entry.duration);
          performance.clearMarks(startMark);
          performance.clearMeasures(measureName);
        }
      } catch (e) {
        // Fallback or ignore if performance API fails
      }
    };

    // 2. Hook into Error Handler
    const originalOnError = Lego.config.onError;
    Lego.config.onError = (err, type, context) => {
      this.metrics.errors++;
      if (this.options.reportToConsole) {
        console.groupCollapsed(`[Lego Monitoring] Error in ${type}`);
        console.error(err);
        console.log('Context:', context);
        console.groupEnd();
      }

      // Call original handler if it exists
      if (originalOnError) originalOnError(err, type, context);
    };

    // Expose metrics API
    Lego.metrics = {
      get: () => this.metrics,
      reset: () => {
        this.metrics.renders = 0;
        this.metrics.errors = 0;
        this.metrics.slowRenders = 0;
        this.metrics.components.clear();
      }
    };

    console.log('[Lego] Monitoring Plugin Installed');
  },

  recordMetric(tagName, duration) {
    this.metrics.renders++;
    if (duration > this.options.slowRenderThreshold) {
      this.metrics.slowRenders++;
      if (this.options.reportToConsole) {
        console.warn(`[Lego Slow Render] <${tagName}> took ${duration.toFixed(2)}ms`);
      }
    }

    if (!this.metrics.components.has(tagName)) {
      this.metrics.components.set(tagName, { count: 0, totalTime: 0, avg: 0 });
    }

    const stats = this.metrics.components.get(tagName);
    stats.count++;
    stats.totalTime += duration;
    stats.avg = stats.totalTime / stats.count;
  }
};
