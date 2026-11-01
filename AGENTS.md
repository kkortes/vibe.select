# CLAUDE.md

AI assistant guidance for working with this repository.

## What this is

A marketplace of Vibe components. A component is plain HTML at a URL; a consumer
points a `<component src>` at it and it renders. The site itself is built with
Vibe and Stylecheat and nothing else.

## Hosting

**Cloudflare, the whole stack: one Worker and one D1 database.**

- The Worker is named `vibe-select` and `wrangler.jsonc` is its whole
  configuration. It serves the front end, built into `compiled/`
  (`bun run build`), as static assets, and runs `server/worker.js` for every
  request no asset answers: the websocket at `/ws`, the component source at
  `/<namespace>/<slug>.html`, and `/js/pin.js`, which goes through the Worker
  first (`run_worker_first`) only so it carries CORS headers.
- One origin serves all of it, so `ORIGIN` in `app/js/env.js` is the page's own
  origin, and that is the site, the socket (`wss://…/ws`) and the component
  source alike. Production, a pull request preview and `bun dev` each read the
  D1 their own Worker binds. A namespace or a root namespace component named
  like a top-level asset folder, page or route would be shadowed by it, which is
  why `SITE` in `server/names.js` (`modules`, `js`, `css`, `images`, `component`,
  `components`, `namespace`, `tag`, `ws` and the rest) is reserved for both —
  `tag` because `/tag/<name>` is the frontpage filtered by that tag.
- It is deployed with `bunx wrangler deploy` from the root, after
  `bun run build`, to the developer's own Cloudflare account. There is no
  deploy script.
- `GOOGLE_CLIENT_ID` is a plain `vars` entry in `wrangler.jsonc`. A client id is
  public; the browser half carries the same value in `app/js/auth.js`.

## Where components are stored

**In Cloudflare D1, bound to the Worker as `DB`. No component is ever a file of its own.**

One D1 database, `vibe-select`. Its schema is `server/migrations/`, applied with
`wrangler d1 migrations apply vibe-select` (`--local` for `wrangler dev`,
`--remote` for the deployed one). D1 enforces foreign keys on its own. Four
tables hold the catalogue; `users` and `sessions` hold Google sign-ins for
`server/store.js`:

| Table        | Holds | Mutable |
|---|---|---|
| `namespaces` | `slug`, `title`, `official`, `unlisted`, `ownerId` | yes |
| `components` | catalogue metadata per `namespace` + `slug`: `title`, `description`, `category`, `icon`, `styling`, `latest`, `defaults`, `ownerId` | yes |
| `revisions`  | one row per published version | **never** |
| `tags`       | the auto tags (`app/js/tags.js`) of each component's latest revision, one row per tag, replaced on every publish so the catalogue lists them in the same query as the components | yes |

An unlisted namespace keeps its components off the frontpage: `components/list`
without a namespace, and `tags/top`, leave it out. Its components still render
at their addresses and list on `/<namespace>`, which asks `components/list` for
that namespace alone. The New namespace modal on `/components` sets it, and its
owner flips it later from the Unlisted switch beside Add component
(`auth/namespaces/unlist`).

**The source bytes of a component live in `revisions.html`** — a text column on
the revision row, holding the component's markup exactly as published.
There is no file per component, no object store, no CDN bucket. `server/source.js` reads
that field and answers with it as `text/html`; that response *is* the component.

A revision row is `{ namespace, slug, version, html, props, events, notes,
authorId, authorName, createdAt }`. The Functions section of the component page
has a button per event the component listens for on the window or document,
sending an example: the detail of a custom event, or the key and code of a
keyboard event. `listeners` in `app/js/tags.js` derives it from what the handler
reads off its event, each field valued by a literal the markup compares it
with. `events` holds an author's own example by event name, and wins where
the code alone cannot know a working value. Revisions are insert-only. `revisions` has its primary
key on `(namespace, slug, version)`, so a second write to a version that exists
is an error rather than an edit — that key is what makes "frozen" a fact rather
than a convention. Publishing bumps `components.latest` and inserts the new
revision in one D1 batch, which is one transaction; it never updates an old one.

D1 binds parameters by position only (`?` or `?NNN`), never by name.

SQLite has no booleans or nested values: `components.defaults` and
`revisions.props` and `revisions.events` are JSON text and `namespaces.official` and `namespaces.unlisted` are `0`/`1`. The
decoders in `server/db.js` turn rows back into the shapes the client receives.

`users.namespaceCount` caps how many namespaces a user may own; it starts at 1
and is raised by hand in the database, except for the developer's account, which
`server/seed.js` sets to 10 on every seed. `auth/namespaces/create` checks it in the
insert itself, and `auth/namespaces/delete` deletes only a namespace of the
caller's own with no published revision in it, taking its unpublished drafts
with it. The Remove namespace button on `/components` is disabled otherwise.

`components.styling` is `inline` or `stylecheat`: whether a component carries
its own styles or assumes Stylecheat on the page it lands in. It is catalogue
metadata, not part of a revision, so its owner changes it in place from the CSS
Styling select on the component page (`auth/components/style`); for anyone else
that select only previews the pick.

`components.defaults` is a derived copy of the latest revision's prop defaults,
kept so the catalogue can be listed in one call without fetching a revision per
card. The frozen truth about props is `revisions.props`.

The only files under `server/seed/` that look like components are inputs to the
seed script: `server/seed/remote/*.html` hold the code of every seeded
component, ported to Vibe from other projects, read at seed time by
`server/seed/catalogue.js`, the one catalogue of the whole seed, and written into `revisions.html` like
any other publish. They are not served from disk. An entry there names the
namespace it is seeded under when that is not `vibe`; `server/seed.js` replaces
each seeded namespace whole, `vibe` and `kortes`, both owned by the developer's
account, so a component left out of the seed is gone from it after the next run.
What a seeded component fetches by prop, such as the card's art, lives in
`app/images/` and is served as an asset.
`server/seed.js` turns the catalogue into SQL and runs it through
`wrangler d1 execute`.

## Addresses and pinning

- `GET /<namespace>/<slug>.html` — the latest revision. Short cache; it moves.
- `GET /<namespace>/<slug>/vN.html` — revision N. Immutable cache; it cannot move.

`vibe` is the root namespace (`ROOT` in `app/js/pin.js`): its components sit at
the top level, `/<slug>.html` and `/<slug>/vN.html`, with no namespace segment.
`path` in `app/js/pin.js` builds every address, and every decoded component
carries it as `path`. A bare name is therefore a root namespace component or a
namespace, and `server/names.js` keeps either from taking the other's name.
No slug reads like `v3`, so `/<slug>/v3.html` is never a component in a
namespace.

Without `.html` the same addresses are the website's pages: `/<namespace>/<slug>`
and `/<slug>` are the component page, `/<namespace>` lists every component under it. Every list
of components — the frontpage, `/<namespace>` and the namespace tabs on
`/components`, which `auth/components/mine` fills with every published
component in the caller's own namespaces, unlisted ones included — is
`app/components/Catalogue.html`, handed the array as `items`.

The address a visitor copies is `…/<slug>.html#vN`. A URL fragment is cut from a
request before it is sent, so no server ever sees one — `js/pin.js` resolves it
in the page into the version path above. The marketplace serves that resolver at
`GET /js/pin.js` so a consumer needs one line to make the fragment form work.

## Authentication

**Google, and only Google, and it is stated rather than inherited.**

- `server/worker.js` runs aaw through its Cloudflare entry,
  `@ape-egg/async-await-websockets/cloudflare/index.js`, and passes it
  `{ providers: [], store: store(env.DB) }`. `providers: []` registers no social
  provider, so no HTTP `/auth/*` route exists. A Worker has no folder to scan,
  so every event is listed by name in `server/worker.js`; a new file under
  `server/events/` answers nothing until it is added there.
- The only path to a session is this app's own `server/events/login/google.js`,
  which verifies a Google ID token and calls aaw's `authenticate`.
  `js/auth.js` holds the browser half and the client id.
- Previews are the one exception, and a deliberate one: on a
  `<alias>-vibe-select.vibe-select.workers.dev` host, Sign in skips Google and calls
  `login/preview`, which signs anyone in as the user `PREVIEW_SIGNIN` names.
  That var exists only in the `previews` block of `wrangler.jsonc`, so
  production refuses the event, and its user row must already be in
  `vibe-select-preview`.
- `server/store.js` is the session store. aaw registers its built-in
  `aaw/login`, `aaw/register` and `aaw/password/*` events whatever `providers`
  says, so the store answers for them by name with "no password login here"
  rather than failing on a missing method.
- There is no GitHub sign-in anywhere in this repository. A GitHub prompt on a
  `*.vercel.app` preview URL is Vercel's own deployment protection, not this app.

Authorization is aaw's folder convention: everything under `server/events/auth/`
requires a session, everything else is open. Reading and rendering a component
need no account; version history, publishing and namespace creation do.

## Layout

`app/` is the compiler's whole world — `"source": "./app"` in the `vibe-compiler`
config. Nothing outside it reaches the static output, which is what keeps server
source and seed data off the static host. Anything added to `app/` as a
top-level `.html` file becomes a page.

- `app/` — pages flat at its root (`index.html`, `component.html`,
  `components.html`, `namespace.html`), plus `components/` (the site's own
  Layout, Topbar and Catalogue), `js/`,
  `css/`, `fonts/`, `images/` and `index.css`.
- `server/` — the Worker: its websocket events, the component-source routes,
  the D1 migrations and the seed.
- `tests/` — runs under `bun test`.

Pages compile as an MPA. There is no `pages/` tree, so the compiler's SPA mode
(`--spa`) has nothing to compile and refuses with "SPA mode: needs a pages
directory". Switching to SPA means moving `app/*.html` into `app/pages/`, and
then dealing with three things MPA hides: `vibe()` seeds only missing keys once
booted, so per-page state with colliding names (`props`, `slug`, `title`) leaks
across navigations; `initWs`/`initAuth` in `js/boot.js` are once-per-app but
`boot()` runs per fragment mount; and the `$.on('afterUpdate')` registrations in
the page modules stack per navigation without teardown.

## Running it

Needs `bun install` in both the root and `server/`. `wrangler` is a root
devDependency; the local D1 it simulates lives in `.wrangler/` (gitignored).

```
cd server && bun run migrate          # schema into the local D1
cd server && bun run seed             # writes the vibe and kortes namespaces and kortes/card
bun dev                               # compiler watch + the Worker on $PORT
```

One process: `bun dev` at the root compiles `app/` into `compiled/` and runs
the Worker with `wrangler dev` on `$PORT`, the same Worker production runs. It
serves the pages as assets, answers every marketplace read and write at `/ws`,
serves the component source that `<component src>` fetches, and routes
`/<namespace>/<slug>` to the component page. In dev, as everywhere, the site, the
socket and the source share the page's own origin (`app/js/env.js`), so
`localhost:$PORT` and the HTTPS dev host behave alike. `bun dev` in `server/` still runs the Worker
alone on `1337`; the site does not need it. `wrangler dev` needs `compiled/` to
exist, so compile once before starting it.

For the deployed database, the same two steps take `--remote`:
`bunx wrangler d1 migrations apply vibe-select --remote` and
`bun run seed --remote`, both in `server/`.

Pull request previews bind `vibe-select-preview` instead (`previews` in
`wrangler.jsonc`), one D1 shared by every preview. `bun run seed --preview` seeds
it. `wrangler d1 migrations` only finds databases listed at the top level of the
config, so its migrations go through a config that names it there with the same
`database_id` and `migrations_dir`, passed with `-c`.

### Never pass `--fouc-as-is` to a stamped build

The compiler stamps values into the HTML and moves conditional branches and
iteration templates into `compiled/vibe-hyperspeed/<page>.manifest.js`. The
runtime decides whether to fetch that manifest by looking for the FOUC marker:

```js
// @ape-egg/vibe/runtime/pre-compiled-manifest.js
const skipNetwork = !!document.querySelector("[vibe-fouc], .vibe-fouc");
```

So `vibe-fouc` present means "runtime mode, no manifest". On a build that has
already been stamped, that combination is fatal and silent: every `<!-- if -->`
true branch and every `<!-- each -->` row is gone from the DOM, with no console
error and no failed request. It looks exactly like a page whose data never
arrived — empty catalogue, no sign-in button — while `window.$` holds all of it.

### Packages are served at `/modules/<name>/`, never under `@ape-egg`

`"modules": "modules"` in the `vibe-compiler` config makes the compiler copy
every package under `dependencies`, and theirs, into `compiled/modules` by its
bare name, so the browser imports `/modules/vibe/index.js`. `dependencies` is
therefore what the browser loads; `hono`, which only the Worker bundle needs, is
a devDependency. Cloudflare's asset server
answers any path holding `@` with a 307 to its `%40` form, and a module's
relative imports resolve against the redirected URL while the module map keys
on the requested one. vibe's `index.js` ↔ `boot.js` cycle then loads `index.js`
twice: `$.on('afterUpdate')` registered before boot lands in one copy and boot
reads the other, so the theme toggle never saves or touches `body.dark`.

### Nothing may vanish from `compiled/` while `wrangler dev` reads it

`wrangler dev` watches `compiled/` and on every change lists the folder, then
stats each file it listed. A file gone in between ends `wrangler dev` with
ENOENT, and nothing answers on the port until it is restarted. So the compiler
overwrites `compiled/` in place and removes only what the build did not write,
once it is done; nothing here may empty, move or delete inside it, and a build
run beside a live `bun dev` leaves the dev server up.

### A state method called from a binding is called unbound

`@[showing()]` reaches the function but not the object, so `this` is undefined
inside it and the binding renders `undefined`. Call it on the state object:

```html
<span>v@[$.showing()]</span>       <!-- works -->
<span>v@[showing()]</span>         <!-- renders "vundefined" -->
```

Same for conditionals: `<!-- if $.owns() -->`, not `<!-- if owns() -->`. A
throwing conditional reads as false, so this one fails by quietly hiding a
branch. Event handlers are unaffected — they already write `$.method()`.
