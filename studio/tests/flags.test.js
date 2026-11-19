import { describe, it, expect } from 'vitest';
import { parseFlags } from '../src/cli/flags.js';

describe('parseFlags', () => {
  it('returns an empty positional list for no arguments', () => {
    expect(parseFlags()).toEqual({ _: [] });
    expect(parseFlags([])).toEqual({ _: [] });
  });

  it('collects positionals in order', () => {
    expect(parseFlags(['dev', 'extra'])._).toEqual(['dev', 'extra']);
  });

  it('reads --key=value', () => {
    expect(parseFlags(['--root=./src']).root).toBe('./src');
  });

  it('reads --key value', () => {
    expect(parseFlags(['--root', './src']).root).toBe('./src');
  });

  it('treats a lone --key as a boolean', () => {
    expect(parseFlags(['--open']).open).toBe(true);
  });

  it('treats --key followed by another flag as a boolean', () => {
    const flags = parseFlags(['--open', '--root', './src']);
    expect(flags.open).toBe(true);
    expect(flags.root).toBe('./src');
  });

  it('reads --no-key as false', () => {
    expect(parseFlags(['--no-open']).open).toBe(false);
  });

  it('does not mistake a short flag name for a --no- prefix', () => {
    expect(parseFlags(['--no']).no).toBe(true);
  });

  it('coerces numeric-looking values to numbers', () => {
    expect(parseFlags(['--port', '6006']).port).toBe(6006);
    expect(parseFlags(['--ratio=1.5']).ratio).toBe(1.5);
    expect(parseFlags(['--port=0']).port).toBe(0);
  });

  it('leaves non-numeric values as strings', () => {
    expect(parseFlags(['--version=1.2.3']).version).toBe('1.2.3');
    expect(parseFlags(['--include', '**/*.lego']).include).toBe('**/*.lego');
  });

  it('supports -p as a short form of --port', () => {
    expect(parseFlags(['-p', '4321']).port).toBe(4321);
    expect(parseFlags(['-p=4321']).port).toBe(4321);
  });

  it('supports -h and -r short forms', () => {
    expect(parseFlags(['-h']).help).toBe(true);
    expect(parseFlags(['-r', './blocks']).root).toBe('./blocks');
  });

  it('camelCases dashed flag names', () => {
    expect(parseFlags(['--out-dir', 'dist']).outDir).toBe('dist');
    expect(parseFlags(['--no-auto-open']).autoOpen).toBe(false);
  });

  it('collects a repeated flag into an array', () => {
    const flags = parseFlags(['--include', 'a/*.lego', '--include', 'b/*.lego']);
    expect(flags.include).toEqual(['a/*.lego', 'b/*.lego']);
  });

  it('keeps appending once a flag is already an array', () => {
    const flags = parseFlags(['--include=a', '--include=b', '--include=c']);
    expect(flags.include).toEqual(['a', 'b', 'c']);
  });

  it('treats everything after -- as positional', () => {
    const flags = parseFlags(['dev', '--', '--root', 'not-a-flag']);
    expect(flags._).toEqual(['dev', '--root', 'not-a-flag']);
    expect(flags.root).toBeUndefined();
  });

  it('parses a realistic dev invocation', () => {
    const flags = parseFlags(['--root', './src', '-p', '4321', '--open', '--exclude', '**/node_modules/**']);
    expect(flags).toEqual({
      _: [],
      root: './src',
      port: 4321,
      open: true,
      exclude: '**/node_modules/**'
    });
  });

  it('accepts an empty --key= value', () => {
    expect(parseFlags(['--root=']).root).toBe('');
  });
});
