import codie from '/modules/codie/codie.js';

import { SOURCE_URL } from '/js/env.js';
import frame from '/js/frame.js';
import { get } from '/js/localStorage.js';
import { ROOT, address, pin } from '/js/pin.js';
import { TAGS } from '/js/tags.js';
import { call } from '/js/ws.js';

// Dependencies stays off the frontpage's filters; a component page still links
// to /tag/dependencies.
const AUTO = TAGS.filter((tag) => tag !== 'Dependencies');

const tag = {
  src: address(SOURCE_URL, 'kortes', 'card', 1),
  name: 'Oskar',
  image: '/images/card/oskar.jpg',
  layout: 'fullart',
  type: 'god',
  element: 'lightning',
  text: 'I always start the game.',
};

// The card's subtypes are its element, so the tag leaves them out and picking
// an element sets both.
const render = (attributes) => ({ ...attributes, src: pin(attributes.src), subtypes: [attributes.element] });

export const state = {
  // The hero renders the very tag it prints, pin and all, and keeps rendering
  // it as the tag is edited.
  demo: render(tag),
  components: [],
  matches: [],
  // Every auto tag but Dependencies, and the four most common user tags, counted by the server.
  filters: { auto: AUTO, user: [] },
  tag: 'All',
  // A visitor who has scrolled past the hero before opens on the components;
  // the wordmark in the topbar brings the hero back.
  hero: !get('mkp-browsed'),
  // Off shows the root namespace only.
  all: false,
  query: '',
  loading: true,
  scrolled: false,

  // The filter lives in the address, so a tag can be linked and reloaded.
  pick(name) {
    this.tag = this.tag === name ? 'All' : name;
    history.replaceState(null, '', this.tag === 'All' ? '/' : `/tag/${encodeURIComponent(this.tag.toLowerCase())}`);
    this.filter();
  },

  filter() {
    const needle = this.query.trim().toLowerCase();

    this.matches = this.components.filter(
      (c) =>
        (this.tag === 'All' || c.category === this.tag || c.tags.includes(this.tag)) &&
        (this.all || c.namespace === ROOT) &&
        (!needle ||
          `${c.namespace}/${c.slug} ${c.title} ${c.description}`.toLowerCase().includes(needle)),
    );
  },
};

const print = (attributes) =>
  `<component\n${Object.entries(attributes)
    .map(([name, value]) => `  ${name}="${value}"`)
    .join('\n')}\n></component>`;

// A template parses the edited tag without running anything in it.
const read = (raw) => {
  const template = document.createElement('template');
  template.innerHTML = raw;
  return template.content.querySelector('component');
};

export const edit = () => {
  const editor = codie('[codie]');
  editor.editable = true;
  editor.code = print(tag);
  editor.onEdit = ({ raw }) => {
    const component = read(raw);
    if (!component) return;
    window.$.demo = render(
      Object.fromEntries(Object.keys(tag).map((name) => [name, component.getAttribute(name) || ''])),
    );
  };
};

const props = ({ src, ...values }) => values;

// The hero's card renders in a frame of its own, the page a consumer with
// Stylecheat would have. An edit to its src mounts it again; any other pushes
// the values into the frame. The hero never comes back once it is gone.
export const preview = () => {
  const { src } = window.$.demo;
  const sync = frame(document.querySelector('preview-host'), {
    src,
    attributes: Object.keys(props(window.$.demo)),
    stylecheat: true,
    read: () => ({ values: props(window.$.demo), dark: window.$.darkMode }),
  });
  const off = window.$.on('afterUpdate', () => {
    if (!window.$.hero) return off();
    window.$.demo.src === src ? sync() : (off(), preview());
  });
};

// The hero fills the first screen until the visitor first scrolls; a page that
// opens already scrolled, like a reload halfway down, starts collapsed.
export const intro = () => {
  window.$.scrolled = scrollY > 0;
  addEventListener('scroll', () => (window.$.scrolled = true), { once: true });

  // The search bar sticking is the visitor moving past the hero: the hero goes,
  // and the scroll is moved by what it took up so the gallery stays put.
  // It is remembered, so the next visit opens on the components.
  const bar = document.querySelector('sticky:has(input[type="search"])');
  const gallery = bar.parentElement.nextElementSibling;
  const watch = () => {
    if (bar.getBoundingClientRect().top > parseFloat(getComputedStyle(bar).top)) return;
    removeEventListener('scroll', watch);
    const before = gallery.getBoundingClientRect().top;
    const settle = window.$.on('afterUpdate', () => {
      settle();
      scrollBy(0, gallery.getBoundingClientRect().top - before);
    });
    window.$.hero = false;
    window.$.browsed = true;
    document.documentElement.setAttribute('browsed', '');
  };
  addEventListener('scroll', watch);
};

// /tag/<name> opens with that tag picked; the address is lowercase, the tag is
// matched against the ones the listed components carry.
const linked = () => decodeURIComponent(location.pathname.match(/^\/tag\/([^/]+)/)?.[1] || '');

export const load = async () => {
  const [components, user] = await Promise.all([call('components/list'), call('tags/top')]);

  window.$.components = components;
  window.$.filters = { auto: AUTO, user };
  window.$.tag =
    components
      .flatMap(({ tags, category }) => [...tags, category])
      .find((name) => name.toLowerCase() === linked()) || 'All';
  window.$.loading = false;
  window.$.filter();
};
