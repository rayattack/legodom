export interface LegoConfig {
  debug: boolean;
  loader?: (tagName: string) => Promise<string> | string | void;
  metrics: Record<string, any>;
  syntax: 'brackets' | 'mustache';
  onError: (err: Error, type: string, el?: HTMLElement) => void;
}

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

export interface LegoInitOptions {
  debug?: boolean;
  styles?: Record<string, string>;
  loader?: (tagName: string) => Promise<string> | string | void;
  studio?: boolean;
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
    error?: string
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

  db(key: string): any;
}

declare const Lego: Lego;
export { Lego };
export default Lego;
