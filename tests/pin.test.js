import { describe, expect, test } from 'bun:test';

import { address, pin, source } from '../app/js/pin.js';

const ORIGIN = 'https://vibe.select';

describe('addresses', () => {
  test('an unpinned address is the bare path', () => {
    expect(address(ORIGIN, 'vibe', 'counter', 0)).toBe(`${ORIGIN}/vibe/counter.html`);
  });

  test('a pinned address carries the version as a fragment', () => {
    expect(address(ORIGIN, 'vibe', 'counter', 5)).toBe(`${ORIGIN}/vibe/counter.html#v5`);
  });

  test('an unpinned source is served from the bare path', () => {
    expect(source(ORIGIN, 'vibe', 'counter', 0)).toBe(`${ORIGIN}/vibe/counter.html`);
  });

  test('a pinned source is served from a path the server can see', () => {
    expect(source(ORIGIN, 'vibe', 'counter', 5)).toBe(`${ORIGIN}/vibe/counter/v5.html`);
  });
});

describe('pin', () => {
  test('resolves a fragment into the version path', () => {
    expect(pin(`${ORIGIN}/vibe/counter.html#v5`)).toBe(`${ORIGIN}/vibe/counter/v5.html`);
  });

  test('leaves an unpinned address alone', () => {
    expect(pin(`${ORIGIN}/vibe/counter.html`)).toBe(`${ORIGIN}/vibe/counter.html`);
  });

  test('leaves a fragment that names no version alone', () => {
    expect(pin(`${ORIGIN}/vibe/counter.html#top`)).toBe(`${ORIGIN}/vibe/counter.html#top`);
  });

  test('round-trips every address the site hands out', () => {
    for (const version of [0, 1, 12, 340])
      expect(pin(address(ORIGIN, 'acme', 'my-thing', version))).toBe(
        source(ORIGIN, 'acme', 'my-thing', version),
      );
  });

  test('survives a namespace that looks like a version', () => {
    expect(pin(`${ORIGIN}/v2/v1.html#v3`)).toBe(`${ORIGIN}/v2/v1/v3.html`);
  });
});
