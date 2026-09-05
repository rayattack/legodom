export interface LegoConfig {
  debug: boolean;
  loader?: (tagName: string) => Promise<string> | string | void;
  metrics: Record<string, any>;
  syntax: 'brackets' | 'mustache';
  onError: (err: Error, type: string, el?: HTMLElement) => void;
  /**
   * Sanitizer for `b-html.safe`. Receives raw HTML, returns cleaned HTML.
   * Set to `DOMPurify.sanitize` (or equivalent) for production; null falls
   * back to a small built-in sanitizer.
   */
  sanitize?: ((html: string) => string) | null;
  /**
   * Opt-in stricter runtime safety: re-throws undefined-identifier
   * ReferenceErrors instead of silently rendering an empty string, and
   * drops dangerous-scheme (`javascript:`/`data:text/html`/`vbscript:`)
   * values on URL-sink attributes (href/src/action/formaction/srcdoc/
   * xlink:href/data).
   */
  strict?: boolean;
  /**
   * Restricts `config.loader` auto-discovery to matching tag names. A
   * console warning is emitted once if `loader` is set without this.
   */
  loaderAllowlist?:
    | string
    | RegExp
    | ((tagName: string) => boolean)
    | Array<string | RegExp | ((tagName: string) => boolean)>
    | null;
}

export type LegoManifestHeaders = Record<string, string | (() => string)>;

export interface LegoManifestGroup {
  base?: string;
  suffix?: boolean | string;
  headers?: LegoManifestHeaders;
  credentials?: RequestCredentials;
  /** Array style: `legos: ['user-card']` fetched from `${base}${name}${suffix}`. */
  legos?: string[];
  /** Map style: `map: { 'user-card': '/blocks/user-card.lego' }`. */
  map?: Record<string, string>;
}

export type LegoManifest =
  | string
  | { url: string; headers?: LegoManifestHeaders; credentials?: RequestCredentials }
  | LegoManifestGroup
  | LegoManifestGroup[];

export interface LegoGlobals {
  $route: {
    url: string;
    route: string;
    params: Record<string, string>;
    query: Record<string, string>;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body: any;
  };
  $go: (path: string, ...targets: string[]) => {
    get: (push?: boolean) => Promise<void>;
    post: (data: any, push?: boolean) => Promise<void>;
    put: (data: any, push?: boolean) => Promise<void>;
    patch: (data: any, push?: boolean) => Promise<void>;
    delete: (push?: boolean) => Promise<void>;
  };
  $db: (key: string) => {
    default: (val: any) => any;
    debounce: (ms: number) => any;
  };
  [key: string]: any;
}

export interface LegoWatchOptions {
  /** Call the callback once with the current value before any change. */
  immediate?: boolean;
}

/** A dotted key path, or a getter receiving the object being watched. */
export type LegoWatchSource<T = any> = string | ((scope: T) => any);

export type LegoWatchCallback = (value: any, oldValue: any) => void;

/**
 * Helpers the runtime puts on every block's state, alongside the author's own
 * keys. Reachable as `this.$watch(...)` inside block logic and as
 * `el.state.$watch(...)` from outside.
 */
export interface LegoBlockState {
  /**
   * Run a callback when a piece of state changes, without going through the
   * template. Stopped automatically when the block unmounts; the returned
   * function stops it sooner.
   */
  $watch(source: LegoWatchSource, cb: LegoWatchCallback, options?: LegoWatchOptions): () => void;
  [key: string]: any;
}

export interface LegoInitOptions {
  debug?: boolean;
  styles?: Record<string, string>;
  loader?: (tagName: string) => Promise<string> | string | void;
  studio?: boolean;
  /** Pre-register lazy-loaded blocks from a manifest (URL, inline group(s), or an auth-wrapped URL). */
  manifest?: LegoManifest;
}

export interface Lego {
  config: LegoConfig;
  globals: LegoGlobals;

  /**
   * Initialize the LegoDOM engine
   */
  init(root?: HTMLElement, options?: LegoInitOptions): Promise<void>;

  /**
   * Define a block
   */
  block(
    tagName: string,
    templateHTML: string,
    logic?: object,
    styles?: string,
    cascade?: string,
    error?: string,
    props?: string
  ): void;

  /**
   * Define a block from a .lego file content string
   */
  defineLegoFile(content: string, filename: string): void;

  /**
   * Register a route
   */
  route(path: string, tagName: string, middleware?: (ctx: { path: string, params: any }) => Promise<boolean> | boolean): void;

  /**
   * Manually snap an element (attach logic)
   */
  snap(el: HTMLElement): void;

  /**
   * Manually unsnap an element (detach logic)
   */
  unsnap(el: HTMLElement): void;

  /**
   * Get list of registered block names
   */
  getLegos(): string[];

  /**
   * Get number of active blocks
   */
  getActiveBlocksCount(): number;

  /**
   * Await the next render flush. Resolves once the batcher has committed
   * the DOM for the pending batch, or after the next animation frame when
   * nothing is queued. Does not wait for the debounced `updated()` hook.
   */
  nextTick(): Promise<void>;

  /**
   * Run `fn` immediately, then again whenever any reactive value it read
   * changes. Intended for `Lego.globals` and `$registry` state outside a
   * block; inside one, prefer `this.$watch`.
   * @returns a function that stops the effect
   */
  effect(fn: () => void): () => void;

  /**
   * Watch a value on `Lego.globals` and call back when it changes. `source`
   * is a dotted key path, or a function receiving `Lego.globals`.
   * @returns a function that stops the watcher
   */
  watch(source: LegoWatchSource<LegoGlobals>, cb: LegoWatchCallback, options?: LegoWatchOptions): () => void;

  db(key: string): any;
}

declare const Lego: Lego;
export { Lego };
export default Lego;
