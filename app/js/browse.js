import codie from '/modules/codie/codie.js';

import { SOURCE_URL } from '/js/env.js';
import { get } from '/js/localStorage.js';
import { ROOT, address, pin } from '/js/pin.js';
import { call } from '/js/ws.js';

const tag = {
  src: address(SOURCE_URL, 'kortes', 'card', 1),
  name: 'Oskar',
  image: 'https://www.worldseed.eu/creature/lightning/oskar-god-of-lightning.jpg',
  type: 'fullart',
  kind: 'god',
  color: 'yellow',
  icon: 'lightning',
  text: 'I always start the game.',
  subtypes: ['lightning'],
};

export const state = {
  // The hero renders the very tag it prints, pin and all, and keeps rendering
  // it as the tag is edited.
  demo: { ...tag, src: pin(tag.src) },
  components: [],
  matches: [],
  // The four most common of each kind, counted by the server.
  filters: { auto: [], user: [] },
  tag: 'All',
  // A visitor who has scrolled past the hero before opens on the catalogue;
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

// An array has no literal form an attribute can hold, so it is shown bound,
// as the component page shows it, and the edited tag leaves it as it was.
const print = (attributes) =>
  `<component\n${Object.entries(attributes)
    .map(([name, value]) => `  ${name}="${Array.isArray(value) ? `@[${name}]` : value}"`)
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
    const attributes = Object.fromEntries(
      Object.keys(tag)
        .filter((name) => !Array.isArray(tag[name]))
        .map((name) => [name, component.getAttribute(name) || '']),
    );
    window.$.demo = { ...tag, ...attributes, src: pin(attributes.src) };
  };
};

// The hero fills the first screen until the visitor first scrolls; a page that
// opens already scrolled, like a reload halfway down, starts collapsed.
export const intro = () => {
  window.$.scrolled = scrollY > 0;
  addEventListener('scroll', () => (window.$.scrolled = true), { once: true });

  // The search bar sticking is the visitor moving past the hero: the hero goes,
  // and the scroll is moved by what it took up so the catalogue stays put.
  // It is remembered, so the next visit opens on the catalogue.
  const bar = document.querySelector('sticky:has(input[type="search"])');
  const catalogue = bar.nextElementSibling;
  const watch = () => {
    if (bar.getBoundingClientRect().top > parseFloat(getComputedStyle(bar).top)) return;
    removeEventListener('scroll', watch);
    const before = catalogue.getBoundingClientRect().top;
    const settle = window.$.on('afterUpdate', () => {
      settle();
      scrollBy(0, catalogue.getBoundingClientRect().top - before);
    });
    window.$.hero = false;
    window.$.browsed = true;
    document.documentElement.setAttribute('browsed', '');
  };
  addEventListener('scroll', watch);
};

// /tag/<name> opens with that tag picked; the address is lowercase, the tag is
// matched against the ones the catalogue carries.
const linked = () => decodeURIComponent(location.pathname.match(/^\/tag\/([^/]+)/)?.[1] || '');

export const load = async () => {
  const [components, filters] = await Promise.all([call('components/list'), call('tags/top')]);

  window.$.components = components;
  window.$.filters = filters;
  window.$.tag =
    components
      .flatMap(({ tags, category }) => [...tags, category])
      .find((name) => name.toLowerCase() === linked()) || 'All';
  window.$.loading = false;
  window.$.filter();
};
