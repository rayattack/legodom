/**
 * Type declarations for `lego-dom/server`, the Node side renderer.
 *
 *   import { createRenderer } from 'lego-dom/server';
 */

/** Interpolation delimiters. `brackets` is `[[ ]]`, `mustache` is `{{ }}`. */
export type LegoSyntax = 'brackets' | 'mustache';

export interface LegoServerRendererOptions {
  /**
   * Delimiters this renderer reads. Defaults to whatever `Lego.config.syntax`
   * says, which is `brackets` unless the project changed it.
   */
  syntax?: LegoSyntax;
  /**
   * Replacement for the built in `b-html.safe` sanitizer, for example
   * `(html) => DOMPurify.sanitize(html)`.
   */
  sanitize?: (html: string, blockName: string) => string;
  /**
   * Blocks to register up front. Takes what `Lego.getDefinitions()` returns,
   * or the app itself, or a Map, or any plain object keyed by tag name, so
   * one module of definitions can serve both halves of a hydrated page.
   */
  definitions?: LegoDefinitionSource;
}

/**
 * Anything `defineFrom` and the `definitions` option accept: an app (or
 * anything else exposing `getDefinitions()`), a plain `{ tagName: definition }`
 * object, or a Map of the same.
 */
export type LegoDefinitionSource =
  | { getDefinitions(): Record<string, LegoBlockDefinition> }
  | Record<string, LegoBlockDefinition>
  | Map<string, LegoBlockDefinition>;

export interface LegoBlockDefinition {
  /** The block's markup, the contents of a `.lego` `<template>` section. */
  template: string;
  /** State, getters and methods. Lifecycle hooks are accepted and never run. */
  logic?: Record<string, any>;
  /** CSS text for the block's `<style>` element. */
  styles?: string;
  /** `false` renders into the host's light DOM instead of a shadow root. */
  shadow?: boolean;
  /** Declared prop names, as a `b-props` string or an array of names. */
  props?: string | string[];
}

/** What templates see as `$route`, and `$route.params` as `$params`. */
export interface LegoServerRoute {
  url?: string;
  route?: string;
  params?: Record<string, string>;
  query?: Record<string, any>;
  method?: string;
  body?: any;
}

export interface LegoRenderOptions {
  /** Values layered over the block's logic defaults. */
  props?: Record<string, any>;
  /** What templates read as `global`. */
  globals?: Record<string, any>;
  /** What `$route` and `$params` return. */
  route?: LegoServerRoute;
  /**
   * Slot content, as HTML. The `default` key fills an unnamed `<slot>`; every
   * other key fills the `<slot name="...">` it is named after.
   */
  slots?: Record<string, string>;
  /** Extra attributes for the host element. `true` writes a valueless one. */
  attrs?: Record<string, string | number | boolean | null>;
}

export interface LegoServerRenderer {
  /** Register a block. Returns the renderer, so calls chain. */
  define(tagName: string, definition: LegoBlockDefinition): LegoServerRenderer;
  /**
   * Register a block from `.lego` source. The script section's default export
   * is evaluated, so it must be a self contained object literal.
   */
  defineLegoFile(source: string, filename?: string): LegoServerRenderer;
  /**
   * Register every block a definitions source holds. The same thing the
   * `definitions` option does, for a renderer that already exists.
   *
   *   createRenderer().defineFrom(Lego);
   */
  defineFrom(source: LegoDefinitionSource): LegoServerRenderer;
  /** Whether a block is registered under this name. */
  has(tagName: string): boolean;
  /** Every registered block name. */
  names(): string[];
  /** Render one block, host element included, to an HTML string. */
  renderToString(tagName: string, options?: LegoRenderOptions): string;
}

/**
 * Create a server renderer. Renderers are independent: definitions,
 * delimiters and sanitizer belong to the renderer, so one process can serve
 * several.
 */
export function createRenderer(options?: LegoServerRendererOptions): LegoServerRenderer;

/**
 * How deep block composition may nest before the renderer emits an empty
 * host and lets the client fill it in.
 */
export const MAX_BLOCK_DEPTH: number;

declare const server: {
  createRenderer: typeof createRenderer;
  MAX_BLOCK_DEPTH: typeof MAX_BLOCK_DEPTH;
};

export default server;
