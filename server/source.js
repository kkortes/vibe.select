import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { ROOT } from '../app/js/pin.js';

// Over HTTP the Worker serves the component source itself, because that is what
// `<component src>` fetches. Everything the marketplace knows about a component
// travels over the websocket instead.
const PINNED = /^v(\d+)\.html$/;

const app = new Hono();

app.use('/*', cors());

// The one client helper this origin's URL scheme needs: a `#vN` fragment is cut
// from a request before it is sent, so the version it names is resolved in the
// page that wrote it. It is a static asset, routed through here only so a
// consumer on another origin may import it.
app.get('/js/pin.js', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);

  c.header('Content-Type', 'application/javascript; charset=UTF-8');
  c.header('Cache-Control', 'public, max-age=3600');

  return c.body(res.body, res.status);
});

const revision = async (c, namespace, slug, version) => {
  const component = await c.env.DB.prepare('SELECT latest FROM components WHERE namespace = ? AND slug = ?')
    .bind(namespace, slug)
    .first();
  if (!component) return c.notFound();

  const found = await c.env.DB.prepare(
    'SELECT version, html FROM revisions WHERE namespace = ? AND slug = ? AND version = ?',
  )
    .bind(namespace, slug, version ?? component.latest)
    .first();
  if (!found) return c.notFound();

  c.header('X-Component-Version', String(found.version));
  c.header('Cache-Control', version ? 'public, max-age=31536000, immutable' : 'public, max-age=60');

  return c.html(found.html);
};

// A tag filter is the frontpage with that tag picked. It sits before the
// component and namespace routes, which is why "tag" is a reserved namespace;
// bare /tag is the frontpage with nothing picked.
app.get('/tag/:name?', (c) => c.env.ASSETS.fetch(new URL('/', c.req.url)));

// A bare name is a root namespace component's page, or else the page listing
// what a namespace publishes. Neither may take the other's name, nor that of a
// page compiled from app/, which answers its own path first (server/names.js).
app.get('/:name{[a-z0-9-]+}', async (c) => {
  const component = await c.env.DB.prepare('SELECT 1 FROM components WHERE namespace = ? AND slug = ?')
    .bind(ROOT, c.req.param('name'))
    .first();

  return c.env.ASSETS.fetch(new URL(component ? '/component' : '/namespace', c.req.url));
});

// The same inside a namespace: its page with that tag picked, which is why no
// component is slugged "tag".
app.get('/:namespace/tag/:name?', (c) => c.env.ASSETS.fetch(new URL('/namespace', c.req.url)));

app.get('/:namespace/:slug/:pin', (c) => {
  const [, version] = c.req.param('pin').match(PINNED) || [];
  if (!version) return c.notFound();

  return revision(c, c.req.param('namespace'), c.req.param('slug'), Number(version));
});

// The same address without .html is the website's page for the component; with
// .html it is the component's raw source. The ending decides, nothing else.
// /cdn-cgi/ belongs to the Cloudflare runtime and is never a namespace.
app.get('/:namespace/:slug{[a-z0-9-]+}', (c) =>
  c.req.param('namespace') === 'cdn-cgi' ? c.notFound() : c.env.ASSETS.fetch(new URL('/component', c.req.url)),
);

// A root namespace component pinned to a version. No slug reads like v3, so
// this never shadows a component in a namespace.
app.get('/:slug/:pin{v\\d+\\.html}', (c) =>
  revision(c, ROOT, c.req.param('slug'), Number(c.req.param('pin').match(PINNED)[1])),
);

app.get('/:namespace/:file{.+\\.html}', (c) =>
  revision(c, c.req.param('namespace'), c.req.param('file').replace('.html', '')),
);

app.get('/:file{[a-z0-9-]+\\.html}', (c) => revision(c, ROOT, c.req.param('file').replace('.html', '')));

export default app;
