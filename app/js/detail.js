import codie from '/modules/codie/codie.js';

import { SOURCE_URL } from '/js/env.js';
import { address, source } from '/js/pin.js';
import { guard, take, state as publishing } from '/js/publishing.js';
import { KEYBOARD, autoTags, listeners, stylingTags } from '/js/tags.js';
import { call } from '/js/ws.js';

// The Worker serves this page at the component's own address, /<namespace>/<slug>.
const params = new URLSearchParams(location.search);
const [namespace, slug] = location.pathname.slice(1).split('/');

const readable = (value) => JSON.stringify(value, null, 2);

// What a created component holds before its first publish: no markup, which
// the starter in the editor already differs from.
const UNPUBLISHED = { version: 0, html: '', props: [], events: {} };

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

// Which props a component takes is the thing being documented, so the attribute
// *names* on the tag are data. That is the one place the page writes markup
// instead of templating it — every value on it stays bound to `values`, so
// editing a prop in the docs re-renders the component and nothing else. The
// markup between the tags is read once when the component mounts, so a change
// to it mounts the component again.
let mounted;

const mount = () => {
  const attrs = window.$.attributes
    .map(({ name }) => `${name}="@[values.${name}]"`)
    .join(' ');

  mounted = children();
  document.querySelector('preview-host').innerHTML =
    `<component src="${window.$.previewSource}" ${attrs}>${mounted}</component>`;
};

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

// The tag under "Use it" is read-only and redrawn on every update, so it
// follows the selected tab and every prop value as it is typed.
const showUsage = () => (usage.code = window.$.snippet());

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
  document.querySelectorAll('codie[json]').forEach((el) => {
    const draft = window.$.drafts[el.getAttribute('json')];

    if (!jsons.has(el)) {
      const json = codie(el);
      json.code = draft;
      json.editable = true;
      json.onEdit = ({ raw }) => window.$.setJson(el.getAttribute('json'), raw);
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
    window.$.on('afterUpdate', () => children() !== mounted && mount());
    window.$.on('afterUpdate', showMarkup);
    window.$.on('afterUpdate', showJson);
  }
  showUsage();
  showMarkup();
  showJson();
};

export const state = {
  ...publishing,
  namespace,
  slug,
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
  styling: 'inline',

  showing() {
    return this.version || this.component?.latest || 0;
  },

  outdated() {
    return this.component && this.showing() < this.component.latest;
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
    const { component: { title, description, category, icon, latest }, revision: { html, props, events } } = this;
    const original = { namespace, slug, title, description, category, icon, html, props, events };
    const edited = { ...original, ...this.unpublished, [key]: value };

    this.unpublished = !latest || ['html', 'title', 'description'].some((k) => edited[k] !== original[k]) ? edited : null;
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

  copy() {
    navigator.clipboard.writeText(this.snippet());
    this.notice = 'Snippet copied';
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

  // The preview shares this page's window and document, so an event sent there
  // reaches its listener. A key listener gets a real KeyboardEvent built from
  // the JSON beside the button; any other carries it as detail.
  dispatch(target, event, json) {
    const example = json && JSON.parse(json);
    ({ window, document })[target].dispatchEvent(
      KEYBOARD.includes(event) ? new KeyboardEvent(event, example) : new CustomEvent(event, { detail: example }),
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
    this.missing && this.render({ ...carried, latest: 0, styling: 'inline' }, { version: 1, html: carried.html, props: carried.props, events: carried.events }, 0);

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
