// Only a namespace with nothing published goes: once a revision exists, it is
// a frozen address under its slug. Its unpublished drafts go with it, in the
// same batch, which is one transaction.
export default async ({ slug }, { db, identity }) => {
  const [, { results }] = await db.batch([
    db
      .prepare(
        'DELETE FROM components WHERE namespace = ?1 AND EXISTS (SELECT 1 FROM namespaces WHERE slug = ?1 AND ownerId = ?2) AND NOT EXISTS (SELECT 1 FROM revisions WHERE namespace = ?1)',
      )
      .bind(slug, identity.id),
    db
      .prepare(
        'DELETE FROM namespaces WHERE slug = ?1 AND ownerId = ?2 AND NOT EXISTS (SELECT 1 FROM components WHERE namespace = ?1) RETURNING slug',
      )
      .bind(slug, identity.id),
  ]);

  if (!results.length) throw Error(`${slug} is not a namespace of yours with nothing published`);

  return results[0];
};
