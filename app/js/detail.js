import codie from '/modules/codie/codie.js';

import { SOURCE_URL } from '/js/env.js';
import frame from '/js/frame.js';
import { ROOT, address, path, place, source } from '/js/pin.js';
import { guard, take, state as publishing } from '/js/publishing.js';
import { KEYBOARD, autoTags, listeners, stylingTags } from '/js/tags.js';
import { call } from '/js/ws.js';

// The Worker serves this page at the component's own address, /<namespace>/<slug>,
// or /<slug> in the root namespace.
const params = new URLSearchParams(location.search);
const [namespace, slug] = place(location.pathname.slice(1));

const readable = (value) => JSON.stringify(value, null, 2);

// What a created component holds before its first publish: no markup, which
// the starter in the editor already differs from.
const UNPUBLISHED = { version: 0, html: '', props: [], events: {}, dependencies: [] };

// A comma separated field, each entry trimmed.
const listed = (list) =>
  list
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const STARTER = '<p>Hello from vibe.select</p>\n';

const tagged = (revision, styling) => [...autoTags(revision), ...stylingTags(styling)];

// The version in view lives in the hash as #v<n>, the form a pinned address
// carries; a bare #<n> is read too. No hash means the latest.
const hashed = () => Number(location.hash.match(/^#v?(\d+)$/)?.[1]) || 0;

// An html prop is no attribute: it is the markup between the tags. A component
// that renders a <slot> takes that markup whether its author declared the prop
// or not, so an undeclared one is read as an empty html prop.
const slotted = ({ html, props = [] }) =>
  props.some(({ type }) => type === 'html') || !/<slot[\s/>]/.test(html)
    ? props
    : [{ name: 'html', type: 'html', default: '', description: '' }, ...props];

// What sits between the tags, as the values in the docs have it.
const children = () => window.$.values[window.$.slot?.name] ?? '';

// What the example puts after the closing tag, such as an element outside the
// component that calls into it.
const after = () => window.$.slot?.after ?? '';

// Which props a component takes is the thing being documented, so the attribute
// *names* on the tag are data, every value on it bound to `values` in the
// preview's frame. Editing a prop in the docs pushes it there and re-renders
// the component and nothing else. The markup between the tags is read once when
// the component mounts, and the styling decides what the frame loads, so a
// change to either mounts the component again. A dependency styled by
// Stylecheat makes the frame load it whatever the component's own styling.
let mounted;
let sync;

const mount = () => {
  mounted = { children: children(), styling: window.$.styling };
  sync = frame(document.querySelector('preview-host'), {
    src: window.$.previewSource,
    attributes: window.$.attributes.map(({ name }) => name),
    children: mounted.children,
    after: after(),
    stylecheat: mounted.styling === 'stylecheat' || window.$.revision.stylecheat,
    read: () => ({ values: window.$.values, dark: window.$.darkMode }),
  });
};

const remount = () =>
  children() !== mounted.children || window.$.styling !== mounted.styling ? mount() : sync();

let editor;
let draft;

// The code view renders through the same `<component src>` as the published
// revision, from a blob of whatever is in the editor.
const preview = (html) => {
  draft && URL.revokeObjectURL(draft);
  draft = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.$.previewSource = draft;
  mount();
};

let usage;
let markup;
let include;

// The tag under "Use it" is read-only and redrawn on every update, so it
// follows the selected tab and every prop value as it is typed.
const showUsage = () => (usage.code = window.$.snippet());

// The script that resolves a pin reads the same on every version, but its row
// is only there while a version is pinned, so a row drawn anew gets a new codie.
const showInclude = () => {
  const el = document.querySelector('codie[include]');
  if (!el || include?.el === el) return;

  include = codie(el);
  include.code = window.$.include();
};

// The markup between the tags is edited in a codie of its own. Its row is only
// there while the component in view has a slot, so a row drawn anew gets a new
// editor, and a reset or another version hands the editor its value.
const showMarkup = () => {
  const el = document.querySelector('codie[markup]');
  if (!el) return;

  if (markup?.el !== el) {
    markup = codie(el);
    markup.code = children();
    markup.editable = true;
    markup.onEdit = ({ raw }) => (window.$.values[window.$.slot.name] = raw);
  }

  markup.code !== children() && (markup.code = children());
};

// A json prop is edited in a codie of its own, row by row, and committed
// through setJson the way it is typed. A reset or another version hands each
// editor its draft.
const jsons = new WeakMap();

const showJson = () =>
  document.querySelectorAll('codie[data-json]').forEach((el) => {
    const draft = window.$.drafts[el.dataset.json];

    if (!jsons.has(el)) {
      const json = codie(el);
      json.code = draft;
      json.editable = true;
      json.onEdit = ({ raw }) => window.$.setJson(el.dataset.json, raw);
      jsons.set(el, json);
    }

    jsons.get(el).code !== draft && (jsons.get(el).code = draft);
  });

const attach = (html) => {
  editor ??= codie('codie');
  editor.editable = true;
  editor.numberedRows = true;
  editor.code = html;
  editor.onEdit = ({ raw }) => {
    preview(raw);
    window.$.edit('html', raw);
  };
  window.$.unpublished = null;

  if (!usage) {
    usage = codie('codie[usage]');
    window.$.on('afterUpdate', showUsage);
    window.$.on('afterUpdate', remount);
    window.$.on('afterUpdate', showMarkup);
    window.$.on('afterUpdate', showJson);
    window.$.on('afterUpdate', showInclude);
  }
  showUsage();
  showMarkup();
  showInclude();
  showJson();
};

export const state = {
  ...publishing,
  namespace,
  slug,
  root: namespace === ROOT,
  component: null,
  revision: null,
  props: [],
  // The html prop, edited above every other prop, and the props that are
  // attributes on the tag.
  slot: null,
  attributes: [],
  listeners: [],
  values: {},
  drafts: {},
  invalid: {},
  version: 0,
  previewSource: '',
  missing: '',
  coding: false,
  // Newest first: the strip lays them out reversed, so it reads 1 to latest and
  // opens scrolled to the latest.
  tabs: [],
  // The selected tab: a pinned version, or 0 for Latest, which follows
  // whatever was published last and carries no hash.
  tab: 0,
  tags: [],
  // Whether the User tags field holds anything but letters between its commas,
  // and Dependencies anything a namespace/slug cannot.
  malformed: { tags: false, dependencies: false },
  styling: 'inline',
  // What the debug button beside the version badge hands the Data Display,
  // and whether its overlay is open.
  inspected: null,
  inspecting: false,

  showing() {
    return this.version || this.component?.latest || 0;
  },

  outdated() {
    return this.component && this.showing() < this.component.latest;
  },

  // As the edit or the revision in view names them; a name gone null is a
  // component removed since, which has no page to link to.
  dependencies() {
    return (this.unpublished?.dependencies ?? this.revision?.dependencies ?? []).map((name) => ({ name, path: name && path(...place(name)) }));
  },

  // The User tags, one badge each once the field is left.
  labels() {
    return (this.unpublished?.category ?? this.component?.category ?? '').split(', ').filter(Boolean);
  },

  // The bytes behind the selected tab. A tab opened on the #v<n> form would
  // show the latest, since the fragment never reaches the server.
  url() {
    return source(SOURCE_URL, this.namespace, this.slug, this.tab);
  },

  // A boolean prop is carried the way HTML carries one — the attribute is there
  // or it is not; dismissable="false" would read as true. An array or an object
  // has no literal form an attribute can hold, so it is shown bound instead.
  // One attribute per row, the way the tag reads best once it is pasted, and
  // an html prop indented between the tags.
  snippet() {
    const attrs = this.attributes
      .map(({ name, type }) =>
        type === 'boolean'
          ? this.values[name] && name
          : type === 'json'
            ? `${name}="@[${name}]"`
            : `${name}="${this.values[name]}"`,
      )
      .filter(Boolean);

    const inner = children().trim();

    return [
      '<component',
      `  src="${address(SOURCE_URL, this.namespace, this.slug, this.tab)}"`,
      ...attrs.map((attr) => `  ${attr}`),
      ...(inner ? ['>', ...inner.split('\n').map((line) => `  ${line}`), '</component>'] : ['></component>']),
      ...(after() ? after().split('\n') : []),
    ].join('\n');
  },

  include() {
    return [
      '<script type="module">',
      `  import { resolvePins } from '${SOURCE_URL}/js/pin.js';`,
      '  resolvePins();',
      '</script>',
    ].join('\n');
  },

  // Back through history replays the card's morph in reverse and lands on the
  // scroll position the visitor left; a shared link has nothing to go back to.
  close() {
    const fromHere = document.referrer && new URL(document.referrer).origin === location.origin;
    this.leave(() => (fromHere ? history.back() : location.assign('/')));
  },

  // The markup, title and description are edited in place; whatever is not
  // edited is published as the revision in view carries it. Editing back to
  // what was there leaves nothing to publish, unless nothing is published here yet.
  edit(key, value) {
    const { component: { title, description, category, icon, latest }, revision: { html, props, events, dependencies } } = this;
    const original = { namespace, slug, title, description, category, icon, html, props, events, dependencies: dependencies.filter(Boolean) };
    const edited = { ...original, ...this.unpublished, [key]: value };

    this.unpublished = !latest || ['html', 'title', 'description', 'category', 'dependencies'].some((k) => String(edited[k]) !== String(original[k])) ? edited : null;
  },

  // Typed as a comma separated list of `namespace/component`.
  // Tidied as the field is left, and kept as the edit only when every name could be one.
  depend(input) {
    const names = listed(input.value);
    input.value = names.join(', ');
    this.malformed.dependencies = names.some((name) => /[^a-z0-9/-]/.test(name));
    this.malformed.dependencies || this.edit('dependencies', names);
  },

  // Tidied as the field is left, and only an all-letters list is kept as the edit.
  tag(input) {
    const tags = listed(input.value).map((tag) => tag[0].toUpperCase() + tag.slice(1));
    input.value = tags.join(', ');
    this.malformed.tags = tags.some((tag) => /\P{L}/u.test(tag));
    this.malformed.tags || this.edit('category', input.value);
  },

  // Its owner saves the pick on the component; anyone else only tries it out,
  // so the tags follow only a saved pick.
  async style(styling) {
    this.styling = styling;
    if (!this.owns()) return;
    await call('auth/components/style', { namespace, slug, styling });
    this.tags = tagged(this.revision, styling);
  },

  // Another tab replaces the code in the editor.
  open(version) {
    this.leave(() => this.show(version));
  },

  inspect() {
    this.inspected = { namespace, slug, url: this.url(), styling: this.styling, tags: this.tags, component: this.component };
    this.inspecting = true;
  },

  copy() {
    navigator.clipboard.writeText(this.snippet());
    window.notify.success('Snippet copied');
  },

  // A json prop is edited as text and only committed once it parses, so a
  // half-typed bracket leaves the preview on the last value that made sense.
  setJson(name, text) {
    this.drafts[name] = text;

    try {
      this.values[name] = JSON.parse(text);
      this.invalid[name] = false;
    } catch {
      this.invalid[name] = true;
    }
  },

  // The preview listens on its frame's window and document, so an event is
  // built and sent there. A key listener gets a real KeyboardEvent built from
  // the JSON beside the button; any other carries it as detail.
  dispatch(target, event, json) {
    const view = document.querySelector('preview-host > iframe').contentWindow;
    const example = json && view.JSON.parse(json);
    ({ window: view, document: view.document })[target].dispatchEvent(
      KEYBOARD.includes(event) ? new view.KeyboardEvent(event, example) : new view.CustomEvent(event, { detail: example }),
    );
  },

  structured() {
    return this.props.some(({ type }) => type === 'json');
  },

  reset() {
    this.values = Object.fromEntries(this.props.map(({ name, default: value }) => [name, value]));

    this.drafts = Object.fromEntries(
      this.props
        .filter(({ type }) => type === 'json')
        .map(({ name, default: value }) => [name, readable(value)]),
    );

    this.invalid = {};
  },

  render(component, revision, version) {
    this.component = component;
    this.tabs = Array.from({ length: component.latest }, (_, i) => component.latest - i);
    this.revision = revision;
    this.version = revision.version;
    this.tab = version;
    this.next = component.latest + 1;
    this.props = slotted(revision);
    this.slot = this.props.find(({ type }) => type === 'html') ?? null;
    this.attributes = this.props.filter((prop) => prop !== this.slot);
    this.listeners = listeners(revision.html).map((listener) => ({ ...listener, example: JSON.stringify(revision.events[listener.event] ?? listener.example) ?? '' }));
    this.styling = component.styling;
    this.tags = tagged(revision, this.styling);
    this.malformed = { tags: false, dependencies: false };
    this.previewSource = source(SOURCE_URL, namespace, slug, revision.version);
    this.reset();
    this.missing = '';
    // Replaced rather than pushed, so going back still leaves the page.
    history.replaceState(null, '', version ? `#v${revision.version}` : location.pathname + location.search);
  },

  async show(version) {
    try {
      const { revision = UNPUBLISHED, ...component } = await call('components/get', {
        namespace,
        slug,
        version: version || undefined,
      });

      this.render(component, revision, version);
    } catch ({ message }) {
      this.missing = message;
      return;
    }

    await window.$.ready;

    const { html } = window.$.revision;

    attach(html || STARTER);
    if (html) return mount();

    // Nothing is published yet, so the starter is the unpublished edit and v1
    // is one press of Publish away.
    preview(STARTER);
    window.$.edit('html', STARTER);
  },

  // An edit carried here from another namespace's component lands as the next
  // version of the visitor's own component by its slug, or as v1 of a new one,
  // open in the editor it was made in.
  async clone(carried) {
    await this.show(0);
    this.missing && this.render({ ...carried, latest: 0, styling: 'inline' }, { version: 1, html: carried.html, props: carried.props, events: carried.events, dependencies: carried.dependencies }, 0);

    await window.$.ready;
    preview(carried.html);
    attach(carried.html);
    this.unpublished = carried;
    this.coding = true;
  },
};

export const load = async () => {
  await guard();

  const carried = take(namespace, slug);

  await (carried ? window.$.clone(carried) : window.$.show(hashed() || Number(params.get('v')) || 0));
  addEventListener('hashchange', () => window.$.show(hashed()));
};
