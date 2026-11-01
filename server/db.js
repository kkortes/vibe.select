import { path } from '../app/js/pin.js';
import { TAGS, stylingTags } from '../app/js/tags.js';

// The schema lives in ./migrations and is applied by `wrangler d1 migrations
// apply`. D1 enforces foreign keys on its own.
//
// SQLite has no booleans or nested values, so those columns are decoded on the
// way out into the shapes the client has always received. A component carries
// its path, so no page has to know where the root namespace's components sit.
export const component = (row) =>
  row && { ...row, path: path(row.namespace, row.slug), defaults: JSON.parse(row.defaults) };

// Tags come back from json_group_array in no particular order, so they are put
// back in the order the component page lists them. The tags table holds what
// is read off the markup; the Stylecheat tag comes from the saved styling.
export const tagged = (row) => {
  const tags = [...JSON.parse(row.tags), ...stylingTags(row.styling)];
  return { ...component(row), tags: TAGS.filter((tag) => tags.includes(tag)) };
};

// The query behind every list of components: published ones only, in the
// shape `tagged` decodes, narrowed by the condition each list adds.
export const catalogue = (where) =>
  `SELECT components.namespace, components.slug, components.title, components.description, components.category,
     components.icon, components.styling, components.latest, components.defaults, components.updatedAt,
     (SELECT json_group_array(tag) FROM tags WHERE tags.namespace = components.namespace AND tags.slug = components.slug) AS tags
   FROM components JOIN namespaces ON namespaces.slug = components.namespace
   WHERE components.latest > 0 AND (${where})
   ORDER BY components.namespace, components.slug`;

export const revision = (row) => row && { ...row, props: JSON.parse(row.props), events: JSON.parse(row.events) };

export const namespace = (row) => ({ ...row, official: !!row.official, unlisted: !!row.unlisted });

export const now = () => new Date().toISOString();
