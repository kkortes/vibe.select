import { namespace } from '../../../db.js';

// Listing is namespace metadata, so it changes in place: an unlisted namespace
// leaves the frontpage, its search and All components, and keeps its addresses.
export default async ({ slug, unlisted }, { db, identity }) => {
  const updated = await db
    .prepare('UPDATE namespaces SET unlisted = ?3 WHERE slug = ?1 AND ownerId = ?2 RETURNING slug, title, official, unlisted')
    .bind(slug, identity.id, unlisted ? 1 : 0)
    .first();

  if (!updated) throw Error(`${slug} is not a namespace of yours`);

  return namespace(updated);
};
