import { path } from '/js/pin.js';
import { call } from '/js/ws.js';

// An edit carried from a component page into a namespace of the visitor's own
// lives here between the two page loads, and only until the component page it
// lands on takes it, so leaving that page discards it like any other
// unpublished edit.
const CARRIED = 'mkp-unpublished';

let onDiscard;

// Spread into the state of every page that can hold an unpublished edit.
export const state = {
  // What `auth/components/publish` takes: the markup as edited, the rest as the
  // edited revision carried it.
  unpublished: null,
  // The version a publish would create.
  next: 1,
  mine: [],
  picking: false,
  // 'publish' or 'leave': which question the overlay asks while asking.
  question: '',
  asking: false,
  failure: '',

  owns() {
    return this.mine.some(({ slug }) => slug === this.namespace);
  },

  // Every way off a page holding an unpublished edit comes through here.
  leave(go) {
    if (!this.unpublished) return go();

    onDiscard = go;
    this.question = 'leave';
    this.asking = true;
  },

  discard() {
    this.unpublished = null;
    this.asking = false;
    onDiscard();
  },

  ask() {
    this.question = 'publish';
    this.failure = '';
    this.asking = true;
  },

  dismiss() {
    this.asking = false;
  },

  async publish() {
    try {
      const { namespace, slug } = await call('auth/components/publish', this.unpublished);

      this.unpublished = null;
      location.assign(`/${path(namespace, slug)}`);
    } catch ({ message }) {
      this.failure = message;
    }
  },

  carry(namespace) {
    const { slug } = this.unpublished;

    sessionStorage.setItem(CARRIED, JSON.stringify({ ...this.unpublished, namespace }));
    this.unpublished = null;
    location.assign(`/${path(namespace, slug)}`);
  },
};

export const take = (namespace, slug) => {
  const carried = JSON.parse(sessionStorage.getItem(CARRIED));

  sessionStorage.removeItem(CARRIED);
  return carried?.namespace === namespace && carried.slug === slug ? carried : null;
};

const refresh = async () => (window.$.mine = window.$.user ? await call('auth/namespaces/mine') : []);

// A link's own handler runs before this one, so a link that already prevented
// its default — a tag filtering the list in place — is not leaving the page.
// Reload, back and a typed address get the browser's own prompt.
export const guard = async () => {
  addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');

    if (!window.$.unpublished || event.defaultPrevented || !link || link.target) return;

    event.preventDefault();
    window.$.leave(() => location.assign(link.href));
  });

  addEventListener('beforeunload', (event) => window.$.unpublished && event.preventDefault());

  window.$.on('afterUpdate', (current, previous) => current.user !== previous.user && refresh());
  await refresh();
};
