import { place } from '../app/js/pin.js';

// What a fresh components row takes as its id. It never changes after.
export const ID = 'lower(hex(randomblob(16)))';

// A revision names the components it renders as `namespace/slug`, or a bare
// slug in the root namespace, and stores their ids, so a component that moves
// is still found. A name that is no published component refuses the publish.
export const resolve = async (db, names, namespace, slug) => {
  if (!Array.isArray(names)) throw Error('Dependencies must be a list');

  const ids = await Promise.all(
    names.map(async (name) => {
      const [dependency, at] = place(String(name));
      if (dependency === namespace && at === slug) throw Error('A component cannot depend on itself');

      const found = await db
        .prepare('SELECT id FROM components WHERE namespace = ? AND slug = ? AND latest > 0')
        .bind(dependency, at)
        .first();
      if (!found) throw Error(`No component ${name}`);

      return found.id;
    }),
  );

  return [...new Set(ids)];
};

// The ids a revision stores, read back as `namespace/slug` for wherever each
// component is now, and null for one that no longer exists.
export const named = `(SELECT json_group_array(components.namespace || '/' || components.slug)
   FROM json_each(revisions.dependencies) LEFT JOIN components ON components.id = json_each.value) AS dependencies`;
