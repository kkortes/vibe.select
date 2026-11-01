import { now } from '../../../db.js';
import { ID, resolve } from '../../../dependencies.js';
import { claim } from '../../../names.js';
import { defaults, validate } from '../../../props.js';
import { slug as slugPattern } from '../../../user.js';
import { autoTags } from '../../../../app/js/tags.js';

// Publishing only ever inserts. A revision that exists is frozen — the way to
// change a component is to publish the next version of it.
export default async (
  { namespace, slug, title, description = '', category = '', icon = null, html, props = [], events = {}, dependencies = [], notes = '' },
  { db, identity },
) => {
  if (!slugPattern.test(String(slug))) throw Error('A slug is lowercase words joined by dashes');
  await claim(db, namespace, slug);
  if (!String(title).trim()) throw Error('A component needs a title');
  if (!String(html).trim()) throw Error('A component needs markup');
  if (String(category).split(', ').filter(Boolean).some((tag) => /\P{L}/u.test(tag))) throw Error('User tags are letters only, comma separated');

  const schema = validate(props);

  if (typeof events !== 'object' || Array.isArray(events)) throw Error('Events must map an event name to its example');

  const owner = await db.prepare('SELECT ownerId FROM namespaces WHERE slug = ?').bind(namespace).first();

  if (!owner) throw Error(`No namespace ${namespace}`);
  if (owner.ownerId !== identity.id) throw Error(`${namespace} is not yours to publish to`);

  const existing = await db
    .prepare('SELECT ownerId FROM components WHERE namespace = ? AND slug = ?')
    .bind(namespace, slug)
    .first();

  if (existing && existing.ownerId !== identity.id) throw Error(`${namespace}/${slug} belongs to someone else`);

  const ids = await resolve(db, dependencies, namespace, slug);

  // A batch is one transaction: the bump and the insert land together or not at
  // all, so `latest` never names a revision that was not written. The revision
  // takes its version from the bumped row.
  const [bumped] = await db.batch([
    db
      .prepare(
        `INSERT INTO components (id, namespace, slug, title, description, category, icon, latest, defaults, ownerId, createdAt, updatedAt)
         VALUES (${ID}, ?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?9)
         ON CONFLICT (namespace, slug) DO UPDATE SET latest = latest + 1, title = ?3, description = ?4,
           category = ?5, icon = ?6, defaults = ?7, updatedAt = ?9
         RETURNING latest`,
      )
      .bind(namespace, slug, title, description, category, icon, JSON.stringify(defaults(schema)), identity.id, now()),
    db
      .prepare(
        `INSERT INTO revisions (namespace, slug, version, html, props, events, dependencies, notes, authorId, authorName, createdAt)
         SELECT namespace, slug, latest, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 FROM components WHERE namespace = ?1 AND slug = ?2`,
      )
      .bind(namespace, slug, html, JSON.stringify(schema), JSON.stringify(events), JSON.stringify(ids), notes, identity.id, identity.name, now()),
    // Component lists show and filter by the latest revision's tags, so they
    // are replaced with every publish.
    db.prepare('DELETE FROM tags WHERE namespace = ? AND slug = ?').bind(namespace, slug),
    ...autoTags({ html, props: schema, dependencies: ids }).map((tag) =>
      db.prepare('INSERT INTO tags (namespace, slug, tag) VALUES (?, ?, ?)').bind(namespace, slug, tag),
    ),
  ]);

  return { namespace, slug, version: bumped.results[0].latest };
};
