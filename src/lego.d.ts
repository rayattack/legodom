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

/** Where an error was raised, handed to `errorCaptured`. */
export interface LegoErrorInfo {
  /** The context label: 'render', 'mounted', 'event-handler', and so on. */
  type: string;
  /** The element the error came from. */
  source: HTMLElement;
}

/**
 * The form half of `ElementInternals`, exposed as `$form` on a block declared
 * with `b-form` / `form: true`. Every member delegates to the element's
 * internals.
 */
export interface LegoFormApi {
  setValue(value: any, state?: any): void;
  setValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void;
  reportValidity(): boolean;
  checkValidity(): boolean;
  readonly form: HTMLFormElement | null;
  readonly name: string | null;
  readonly validity: ValidityState;
}

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

  /** Present only on a form-associated block (`b-form` / `form: true`). */
  $form?: LegoFormApi;

  /**
   * True while an `async mounted()` is still running. The key exists only on
   * blocks whose `mounted()` returned a promise.
   */
  $loading?: boolean;

  /** Set by `formDisabledCallback` on a form-associated block. */
  $disabled?: boolean;

  /** Called after the block mounts. Returning a promise sets `$loading`. */
  mounted?(): void | Promise<void>;

  /** Called immediately before a batched re-render, with the old DOM intact. */
  beforeUpdate?(): void | Promise<void>;

  /**
   * Called synchronously after each render flush commits, once per flush.
   * The DOM is settled, so it is safe to measure here.
   */
  updated?(): void | Promise<void>;

  /** Called when the block leaves the DOM. */
  unmounted?(): void | Promise<void>;

  /**
   * Called for an error raised by this block or any descendant, innermost
   * first. Return `false` to claim the error: no error boundary is rendered
   * and `config.onError` is not called. Return anything else to let it pass.
   */
  errorCaptured?(err: Error, info: LegoErrorInfo): boolean | void;

  [key: string]: any;
}

/**
 * The options-object form of `Lego.block()`.
 *
 * `props` is a comma-separated declaration list, braces optional. An entry is
 * `name`, `name: Type`, `name = default`, or `name: Type = default`, where
 * Type is one of String, Number, Boolean, Array, Object, Function and the
 * default is a template expression evaluated once per instance:
 *
 *   'title: String = "Untitled", count: Number = 0, items: Array = []'
 *
 * A parent writes a declared prop with `:prop-name="expr"` on the child tag
 * (kebab-case maps to camelCase), which stays live: the child sees every
 * later change. A plain `prop-name="text"` attribute is coerced through the
 * declared type instead. Data flows one way; a child may write its own props,
 * and the parent's next change overwrites what it wrote.
 */
export interface LegoBlockOptions {
  /** Template body, as it would appear inside `<template b-id="…">`. */
  template?: string;
  /** Initial state, methods, getters and lifecycle hooks. */
  logic?: object;
  /** Space-separated stylesheet keys. Maps to `b-stylesheets`. */
  styles?: string;
  /** Space-separated keys cascaded to descendants. Maps to `b-cascade`. */
  cascade?: string;
  /** Tag of an error block to render when this one crashes. Maps to `b-error`. */
  error?: string;
  /** Prop contract. Maps to `b-props`. */
  props?: string;
  /**
   * `false` renders the block into the light DOM instead of a shadow root,
   * so page-level CSS, ARIA id references and native form submission reach
   * inside it. Slots are emulated. Maps to `b-shadow="false"`.
   */
  shadow?: boolean;
  /**
   * `true` makes the block form associated: it gains `$form` and its `value`
   * key, if it has one, is submitted with the surrounding form. Maps to
   * `b-form`.
   */
  form?: boolean;
}

export interface LegoInitOptions {
  debug?: boolean;
  styles?: Record<string, string>;
  loader?: (tagName: string) => Promise<string> | string | void;
  studio?: boolean;
  /** Pre-register lazy-loaded blocks from a manifest (URL, inline group(s), or an auth-wrapped URL). */
  manifest?: LegoManifest;
  /**
   * Selector a matched route renders into when the navigation names no
   * `b-target`. Defaults to `lego-router`. Two apps on one page each set
   * their own, which is how they route side by side.
   */
  routerTarget?: string;
}

/** Options for `Lego.createApp()`. */
export interface LegoCreateAppOptions {
  /** Merged over a fresh copy of the default config. */
  config?: Partial<LegoConfig>;
  /**
   * Seeds the app's reactive globals, which always also carry `$route`,
   * `$go`, `$mount` and `$db`.
   */
  globals?: Record<string, any>;
}

/**
 * A plugin: an object with an `install` method, or a plain function. Either
 * receives the app it is being installed on.
 */
export type LegoPlugin<O = any> =
  | { install(app: LegoApp, options?: O): void }
  | ((app: LegoApp, options?: O) => void);

/**
 * A LegoDOM application instance: its own config, globals, routes,
 * `$registry` states and plugins. The default export `Lego` is one of these,
 * created with the default config.
 *
 * Custom element names are global to the document, so a tag belongs to
 * whichever app defined it first; a second app defining the same tag is
 * warned and ignored.
 */
export interface LegoApp {
  config: LegoConfig;
  globals: LegoGlobals;

  /**
   * Initialize the LegoDOM engine
   */
  init(root?: HTMLElement, options?: LegoInitOptions): Promise<void>;

  /**
   * Define a block from an options object. Preferred once a block needs
   * anything past `props`, since `shadow` and `form` have no positional slot.
   */
  block(tagName: string, options: LegoBlockOptions): void;

  /**
   * Define a block, positional form. Unchanged and still supported.
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
   * Await the next render flush. Resolves once the batcher has committed the
   * DOM for the pending batch and run its `updated()` hooks, or after the
   * next animation frame when nothing is queued.
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
   * Watch a value on this app's globals and call back when it changes.
   * `source` is a dotted key path, or a function receiving the globals.
   * @returns a function that stops the watcher
   */
  watch(source: LegoWatchSource<LegoGlobals>, cb: LegoWatchCallback, options?: LegoWatchOptions): () => void;

  db(key: string): any;

  /**
   * Install a plugin against this app: `plugin.install(app, options)`, or
   * `plugin(app, options)` for a plain function. Once per app per plugin, so
   * a repeat call is a no-op and the same plugin on two apps is installed
   * twice, each time receiving that app.
   * @returns the app, for chaining
   */
  use<O = any>(plugin: LegoPlugin<O>, options?: O): LegoApp;

  /** Create another independent app instance. */
  createApp(options?: LegoCreateAppOptions): LegoApp;

  /** Manually mount a block, optionally into a target. */
  mount(tagName: string | null, target?: string | HTMLElement | HTMLElement[], props?: Record<string, any>): any;
}

/**
 * The default app. Kept as a distinct name so existing `Lego` typings and
 * imports are unchanged.
 */
export interface Lego extends LegoApp {}

/**
 * Create an independent LegoDOM application instance.
 *
 * @param options.config merged over a fresh copy of the default config
 * @param options.globals seeds the app's reactive globals
 */
export function createApp(options?: LegoCreateAppOptions): LegoApp;

declare const Lego: Lego;
export { Lego };
export default Lego;
