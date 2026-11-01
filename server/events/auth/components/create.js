import { now } from '../../../db.js';
import { ID } from '../../../dependencies.js';
import { claim } from '../../../names.js';
import { slug as slugPattern } from '../../../user.js';
import { lettered, slugify } from '../../../../app/js/naming.js';

// A created component has its components row and nothing published: `latest` 0
// keeps it out of every listing and its source unanswered until the first
// publish bumps it to v1.
export default async ({ namespace, title = '', description }, { db, identity }) => {
  const slug = slugify(title);

  if (!lettered(title)) throw Error('A name needs at least 3 letters');
  if (!slugPattern.test(slug)) throw Error('A name needs letters or digits a slug can be read off');
  await claim(db, namespace, slug);

  const owner = await db.prepare('SELECT ownerId FROM namespaces WHERE slug = ?').bind(namespace).first();

  if (!owner) throw Error(`No namespace ${namespace}`);
  if (owner.ownerId !== identity.id) throw Error(`${namespace} is not yours to create in`);

  const taken = await db.prepare('SELECT 1 FROM components WHERE namespace = ? AND slug = ?').bind(namespace, slug).first();
  if (taken) throw Error(`${namespace}/${slug} exists already`);

  await db
    .prepare(
      `INSERT INTO components (id, namespace, slug, title, description, category, icon, latest, defaults, ownerId, createdAt, updatedAt)
       VALUES (${ID}, ?1, ?2, ?3, ?4, '', NULL, 0, '{}', ?5, ?6, ?6)`,
    )
    .bind(namespace, slug, title.trim(), description?.trim() || null, identity.id, now())
    .run();

  return { namespace, slug };
};
