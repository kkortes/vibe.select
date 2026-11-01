const PINNED = /#v(\d+)$/;

// A component is addressed by `<origin>/<namespace>/<slug>.html`, or by
// `<origin>/<slug>.html` in the root namespace, and a `#vN`
// fragment on that address pins the render to revision N. A fragment is cut
// from a request before it is sent, so no server ever sees one — the version it
// names is resolved here, on the client, into the path the marketplace serves
// that frozen revision at.

// The root namespace's components sit at the top level, with no namespace
// segment in their address.
export const ROOT = 'vibe';

// Where a component sits under the origin, both as a page and as its source.
export const path = (namespace, slug) => (namespace === ROOT ? slug : `${namespace}/${slug}`);

// The address a visitor copies.
export const address = (origin, namespace, slug, version) =>
  `${origin}/${path(namespace, slug)}.html${version ? `#v${version}` : ''}`;

// The address it resolves to.
export const source = (origin, namespace, slug, version) =>
  version
    ? `${origin}/${path(namespace, slug)}/v${version}.html`
    : `${origin}/${path(namespace, slug)}.html`;

export const pin = (src) => {
  const [, version] = src.match(PINNED) || [];

  return version ? src.replace(PINNED, '').replace(/\.html$/, `/v${version}.html`) : src;
};

// Call this before vibe boots and every pinned `<component src>` on the page
// renders the revision it asked for. Unpinned tags are left alone — they
// resolve to latest, which is what the bare address serves.
export const resolvePins = (root = document) =>
  root
    .querySelectorAll('[src*=".html#v"]')
    .forEach((el) => el.setAttribute('src', pin(el.getAttribute('src'))));
