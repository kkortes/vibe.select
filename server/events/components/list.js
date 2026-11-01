import { published, tagged } from '../../db.js';

// Published components, readable by anyone. There are few enough of them to
// hand over whole, so search and filtering stay instant on the client. Asked
// for one namespace, it lists that namespace whether listed or not; asked for
// none, it is the frontpage's list, which leaves unlisted namespaces out.
export default async (query, { db }) =>
  (
    await db
      .prepare(published('?1 IS NULL AND namespaces.unlisted = 0 OR components.namespace = ?1'))
      .bind(query?.namespace ?? null)
      .all()
  ).results.map(tagged);
