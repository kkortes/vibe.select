import { component as decodeComponent, revision as decodeRevision } from '../../db.js';
import { named, stylecheat } from '../../dependencies.js';

// Public: anyone may read and render any published component, at latest or at
// a pinned version. Only the version *history* asks for a session.
export default async ({ namespace, slug, version }, { db }) => {
  const component = decodeComponent(
    await db
      .prepare(
        'SELECT namespace, slug, title, description, category, icon, styling, latest, defaults, createdAt, updatedAt FROM components WHERE namespace = ? AND slug = ?',
      )
      .bind(namespace, slug)
      .first(),
  );

  if (!component) throw Error(`No component ${namespace}/${slug}`);

  // Created and not yet published: there is no revision to hand over.
  if (!component.latest) return component;

  const revision = decodeRevision(
    await db
      .prepare(
        `SELECT version, html, props, events, ${named}, notes, authorId, authorName, createdAt FROM revisions WHERE namespace = ? AND slug = ? AND version = ?`,
      )
      .bind(namespace, slug, version || component.latest)
      .first(),
  );

  if (!revision) throw Error(`No version ${version} of ${namespace}/${slug}`);

  const dependencies = await db.prepare(stylecheat).bind(namespace, slug, revision.version).first();

  return { ...component, revision: { ...revision, stylecheat: !!dependencies.stylecheat } };
};
