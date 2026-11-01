// The four most common user tags, counted in the database so the answer costs
// the same at ten components or ten thousand. Like the frontpage they filter,
// they leave unlisted namespaces out.
export default async (_, { db }) =>
  (
    await db
      .prepare(
        'SELECT category AS tag FROM components JOIN namespaces ON namespaces.slug = components.namespace WHERE latest > 0 AND unlisted = 0 GROUP BY category ORDER BY COUNT(*) DESC, category LIMIT 4',
      )
      .all()
  ).results.map(({ tag }) => tag);
