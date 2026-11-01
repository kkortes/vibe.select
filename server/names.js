import { ROOT } from '../app/js/pin.js';

// A namespace and a root namespace component share the top level of the site,
// so neither may take a name the site answers itself: an asset folder, a page,
// the socket, the tag filter or Cloudflare's own /cdn-cgi/.
export const SITE = ['modules', 'js', 'css', 'fonts', 'images', 'vibe-hyperspeed', 'index', 'component', 'components', 'namespace', 'tag', 'ws', 'cdn-cgi'];

// Names no one else may claim a namespace under.
export const RESERVED = [ROOT, 'stylecheat', 'codie', 'api', 'docs', 'admin', ...SITE];

// A component name in the root namespace is a name at the top level, so it may
// be neither a namespace nor one of the site's own. And no slug reads like v3,
// which would be a pinned version of a root namespace component.
export const claim = async (db, namespace, slug) => {
  if (slug === 'tag') throw Error('tag is reserved for /<namespace>/tag/<name>');
  if (/^v\d+$/.test(slug)) throw Error(`${slug} reads as a version`);
  if (namespace !== ROOT) return;
  if (SITE.includes(slug)) throw Error(`${slug} is reserved`);
  if (await db.prepare('SELECT 1 FROM namespaces WHERE slug = ?').bind(slug).first()) throw Error(`${slug} is a namespace`);
};
