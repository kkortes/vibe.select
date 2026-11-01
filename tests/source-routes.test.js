import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getPlatformProxy } from 'wrangler';

import source from '../server/source.js';

// The Worker's own D1 and assets bindings, simulated locally and kept in memory.
const { env, dispose } = await getPlatformProxy({ configPath: `${import.meta.dir}/../wrangler.jsonc`, persist: false });

const fetch = (url) => source.fetch(new Request(url), env);

const origin = 'http://localhost';

beforeAll(async () => {
  const schema = await Bun.file(`${import.meta.dir}/../server/migrations/0001_schema.sql`).text();

  await env.DB.batch(
    [
      ...schema.split(';').filter((statement) => statement.trim()),
      "INSERT INTO namespaces (slug, title, createdAt) VALUES ('vibe', 'Vibe', ''), ('acme', 'Acme', '')",
      "INSERT INTO components (namespace, slug, title, category, latest, defaults, createdAt, updatedAt) VALUES ('vibe', 'counter', 'Counter', 'Interactive', 3, '{}', '', ''), ('acme', 'counter', 'Counter', 'Interactive', 1, '{}', '', '')",
      "INSERT INTO revisions (namespace, slug, version, html, props, notes, authorName, createdAt) VALUES ('vibe', 'counter', 1, '<p>one</p>', '[]', '', 'Vibe', ''), ('vibe', 'counter', 3, '<p>three</p>', '[]', '', 'Vibe', ''), ('acme', 'counter', 1, '<p>acme</p>', '[]', '', 'Acme', '')",
    ].map((statement) => env.DB.prepare(statement)),
  );
});

afterAll(dispose);

describe('component source', () => {
  test('a bare address serves the latest revision', async () => {
    const res = await fetch(`${origin}/counter.html`);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Component-Version')).toBe('3');
    expect(await res.text()).toBe('<p>three</p>');
  });

  test('the latest revision is not cached for long, because it moves', async () => {
    const res = await fetch(`${origin}/counter.html`);

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  test('a version path serves that frozen revision', async () => {
    const res = await fetch(`${origin}/counter/v1.html`);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Component-Version')).toBe('1');
    expect(await res.text()).toBe('<p>one</p>');
  });

  test('a frozen revision is cached forever, because it can never change', async () => {
    const res = await fetch(`${origin}/counter/v1.html`);

    expect(res.headers.get('Cache-Control')).toContain('immutable');
  });

  test('a version that was never published is not found', async () => {
    expect((await fetch(`${origin}/counter/v2.html`)).status).toBe(404);
  });

  test('a component that does not exist is not found', async () => {
    expect((await fetch(`${origin}/nope.html`)).status).toBe(404);
  });

  test('a third segment that names no version is not found', async () => {
    expect((await fetch(`${origin}/acme/counter/latest.html`)).status).toBe(404);
  });

  test('a component in another namespace is addressed under it', async () => {
    expect(await (await fetch(`${origin}/acme/counter.html`)).text()).toBe('<p>acme</p>');
    expect(await (await fetch(`${origin}/acme/counter/v1.html`)).text()).toBe('<p>acme</p>');
  });

  test('the source is reachable cross-origin, which is the whole point', async () => {
    const res = await fetch(`${origin}/counter.html`);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  test('the pin resolver is served from the same origin as the components', async () => {
    const res = await fetch(`${origin}/js/pin.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('javascript');
    expect(await res.text()).toContain('export const resolvePins');
  });
});
