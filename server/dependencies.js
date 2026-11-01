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

// Whether any component a revision renders, or any it renders in turn at its
// latest, assumes Stylecheat on the page, so a frame holding the revision
// loads Stylecheat for them even when the revision carries its own styles.
export const stylecheat = `WITH RECURSIVE tree(id) AS (
     SELECT json_each.value FROM revisions, json_each(revisions.dependencies)
     WHERE revisions.namespace = ?1 AND revisions.slug = ?2 AND revisions.version = ?3
     UNION
     SELECT json_each.value FROM tree
     JOIN components ON components.id = tree.id
     JOIN revisions ON revisions.namespace = components.namespace AND revisions.slug = components.slug AND revisions.version = components.latest,
     json_each(revisions.dependencies)
   )
   SELECT EXISTS (SELECT 1 FROM tree JOIN components ON components.id = tree.id WHERE components.styling = 'stylecheat') AS stylecheat`;
