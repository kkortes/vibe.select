import { call } from '/js/ws.js';

// The four most common names, counted over the namespace's own components so
// the bar offers no tag that would empty the list.
const top = (names) =>
  Object.entries(Object.groupBy(names, (name) => name))
    .sort(([a, { length: x }], [b, { length: y }]) => y - x || a.localeCompare(b))
    .slice(0, 4)
    .map(([name]) => name);

const [, namespace, , linked = ''] = location.pathname.split('/').map(decodeURIComponent);

export const state = {
  // The Worker serves this page at /<namespace> and /<namespace>/tag/<name>.
  namespace,
  components: [],
  matches: [],
  filters: { auto: [], user: [] },
  tag: 'All',
  query: '',
  loading: true,

  tagged: (name) => `/${namespace}/tag/${encodeURIComponent(name.toLowerCase())}`,

  // Picking the tag already picked unpicks it, back to every component. The
  // filter lives in the address, so a tag can be linked and reloaded.
  pick(name) {
    this.tag = this.tag === name ? 'All' : name;
    history.replaceState(null, '', this.tag === 'All' ? `/${namespace}` : this.tagged(this.tag));
    this.filter();
  },

  filter() {
    const needle = this.query.trim().toLowerCase();

    this.matches = this.components.filter(
      (c) =>
        (this.tag === 'All' || c.category === this.tag || c.tags.includes(this.tag)) &&
        (!needle || `${c.namespace}/${c.slug} ${c.title} ${c.description}`.toLowerCase().includes(needle)),
    );
  },
};

export const load = async () => {
  // Asked for by name, so an unlisted namespace lists its own components too.
  const components = await call('components/list', { namespace });

  window.$.components = components;
  window.$.filters = { auto: top(components.flatMap(({ tags }) => tags)), user: top(components.map(({ category }) => category).filter(Boolean)) };
  window.$.tag = components.flatMap(({ tags, category }) => [...tags, category]).find((name) => name.toLowerCase() === linked) || 'All';
  window.$.loading = false;
  window.$.filter();
};
