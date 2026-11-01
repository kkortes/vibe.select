import catalogue from './seed/catalogue.js';
import { now } from './db.js';
import { defaults, validate } from './props.js';
import { autoTags } from '../app/js/tags.js';

// `bun run seed` seeds the local D1 that `wrangler dev` reads; `bun run seed
// --remote` seeds the deployed one; `bun run seed --preview` seeds
// vibe-select-preview, the D1 every pull request's preview binds.
const preview = process.argv.includes('--preview');
const database = preview ? 'vibe-select-preview' : 'vibe-select';
const target = preview || process.argv.includes('--remote') ? '--remote' : '--local';

// Seeded props go through the same validation a published revision does, so the
// catalogue can never hold a schema the publish event would have refused.
const checked = (components) =>
  components.map((component) => ({
    ...component,
    versions: component.versions.map((version) => ({ ...version, props: validate(version.props) })),
  }));

const seeded = checked(catalogue);

// Each seeded namespace is replaced whole: its components are written as listed
// and nothing else is left under it. A component names its namespace, or is vibe's.
const NAMESPACES = [
  { slug: 'vibe', title: 'Vibe', official: 1 },
  { slug: 'webdev', title: 'Webdev', official: 0 },
].map((ns) => ({ ...ns, components: seeded.filter(({ namespace = 'vibe' }) => namespace === ns.slug) }));

const literal = (value) => (value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);

const row = (...cells) => cells.map(literal).join(', ');

const values = (...cells) => `(${row(...cells)})`;

// The seeded namespaces belong to the developer's Google account. Users get a
// fresh id at first sign-in, so the account is seeded by its Google id and the
// namespace points at whatever id that row holds — the login upsert keeps it.
const OWNER = { googleId: '113094163908909945020', email: 'me@korte.kim', name: 'Kim Korte' };

const owner = `(SELECT id FROM users WHERE googleId = ${literal(OWNER.googleId)})`;

const sql = [
  `INSERT INTO users (id, googleId, email, name, createdAt, updatedAt)
   VALUES ${values(crypto.randomUUID(), OWNER.googleId, OWNER.email, OWNER.name, now(), now())}
   ON CONFLICT (googleId) DO NOTHING;`,
  ...NAMESPACES.flatMap(({ slug: namespace, title: author, official, components }) => [
    `INSERT INTO namespaces (slug, title, official, ownerId, createdAt) VALUES (${row(namespace, author, official)}, ${owner}, ${literal(now())})
     ON CONFLICT (slug) DO UPDATE SET title = excluded.title, official = excluded.official, ownerId = excluded.ownerId;`,
    `DELETE FROM revisions WHERE namespace = ${literal(namespace)};`,
    `DELETE FROM components WHERE namespace = ${literal(namespace)};`,
    ...components.flatMap(({ slug, title, description, category, icon, styling = 'inline', versions }) => [
      `INSERT INTO components (namespace, slug, title, description, category, icon, styling, latest, defaults, createdAt, updatedAt, ownerId)
       VALUES (${row(namespace, slug, title, description, category, icon, styling, versions.length, JSON.stringify(defaults(versions.at(-1).props)), now(), now())}, ${owner});`,
      ...versions.map(
        ({ html, props, events, notes }, i) =>
          `INSERT INTO revisions (namespace, slug, version, html, props, events, notes, authorId, authorName, createdAt)
           VALUES ${values(namespace, slug, i + 1, html, JSON.stringify(props), JSON.stringify(events), notes, null, author, now())};`,
      ),
      ...autoTags(versions.at(-1)).map((tag) => `INSERT INTO tags (namespace, slug, tag) VALUES ${values(namespace, slug, tag)};`),
    ]),
  ]),
].join('\n');

const file = `${import.meta.dir}/../.wrangler/seed.sql`;

await Bun.write(file, sql);

const exitCode = await Bun.spawn(['wrangler', 'd1', 'execute', database, target, `--file=${file}`], {
  stdio: ['inherit', 'inherit', 'inherit'],
}).exited;

if (exitCode) process.exit(exitCode);

NAMESPACES.forEach(({ slug: namespace, components }) =>
  console.info(`Seeded ${namespace}: ${components.map(({ slug, versions }) => `${slug} through v${versions.length}`).join(', ') || 'no components'}`),
);
