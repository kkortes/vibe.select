import { now } from '../../../db.js';

const STYLINGS = ['inline', 'stylecheat'];

// Styling belongs to the component, not to a revision, so it changes in place
// without publishing a version.
export default async ({ namespace, slug, styling }, { db, identity }) => {
  if (!STYLINGS.includes(styling)) throw Error(`Styling must be one of ${STYLINGS.join(', ')}`);

  const styled = await db
    .prepare('UPDATE components SET styling = ?3, updatedAt = ?4 WHERE namespace = ?1 AND slug = ?2 AND ownerId = ?5 RETURNING styling')
    .bind(namespace, slug, styling, now(), identity.id)
    .first();

  if (!styled) throw Error(`${namespace}/${slug} is not a component of yours`);

  return { namespace, slug, ...styled };
};
