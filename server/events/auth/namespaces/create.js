import { namespace as decode, now } from '../../../db.js';
import { RESERVED } from '../../../names.js';
import { slug as slugPattern } from '../../../user.js';
import { ROOT } from '../../../../app/js/pin.js';

export default async ({ slug, title, unlisted = false }, { db, identity }) => {
  if (!slugPattern.test(String(slug))) throw Error('A namespace is lowercase words joined by dashes');
  if (RESERVED.includes(slug)) throw Error(`${slug} is reserved`);

  // A root namespace component sits at the same top-level address.
  const taken = await db
    .prepare('SELECT 1 FROM namespaces WHERE slug = ?1 UNION SELECT 1 FROM components WHERE namespace = ?2 AND slug = ?1')
    .bind(slug, ROOT)
    .first();
  if (taken) throw Error(`${slug} is taken`);

  // The cap is read in the same statement as the insert, so two creates at once
  // cannot both slip under it.
  const created = await db
    .prepare(
      `INSERT INTO namespaces (slug, title, official, unlisted, ownerId, createdAt)
       SELECT ?1, ?2, 0, ?5, ?3, ?4 FROM users
       WHERE id = ?3 AND namespaceCount > (SELECT count(*) FROM namespaces WHERE ownerId = ?3)
       RETURNING *`,
    )
    .bind(slug, title?.trim() || slug, identity.id, now(), unlisted ? 1 : 0)
    .first();

  if (!created) throw Error('You own as many namespaces as your account allows');

  return { ...decode(created), components: 0 };
};
