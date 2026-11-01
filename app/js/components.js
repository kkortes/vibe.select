import { lettered, slugify } from '/js/naming.js';
import { SOURCE_URL } from '/js/env.js';
import { path } from '/js/pin.js';
import { call } from '/js/ws.js';

export const state = {
  mine: [],
  // The published components in those namespaces, listed under the tabs.
  owned: [],
  // The selected tab: a namespace slug, or '' for All.
  namespace: '',
  slug: '',
  unlisted: false,
  failure: '',
  // The component the "Add component" dialog is creating in the selected namespace.
  draft: { title: '', description: '' },
  slugify,

  compose() {
    this.slug = '';
    this.unlisted = false;
    this.failure = '';
    document.querySelector('dialog[namespace]').showModal();
  },

  limit() {
    const count = this.user.namespaceCount;
    return `${count} namespace${count === 1 ? '' : 's'}`;
  },

  // The address the namespace being typed puts its components under.
  address() {
    return `${SOURCE_URL}/${this.slug || 'your-namespace'}`;
  },

  dismiss() {
    document.querySelectorAll('dialog').forEach((dialog) => dialog.close());
  },

  listed() {
    return this.owned.filter(({ namespace }) => !this.namespace || namespace === this.namespace);
  },

  selected() {
    return this.mine.find(({ slug }) => slug === this.namespace);
  },

  deletable() {
    return !this.selected().published;
  },

  async unlist(unlisted) {
    const { slug } = await call('auth/namespaces/unlist', { slug: this.namespace, unlisted });

    this.mine = this.mine.map((ns) => (ns.slug === slug ? { ...ns, unlisted } : ns));
  },

  confirm() {
    this.failure = '';
    document.querySelector('dialog[removal]').showModal();
  },

  async remove() {
    try {
      const { slug } = await call('auth/namespaces/delete', { slug: this.namespace });

      this.mine = this.mine.filter((ns) => ns.slug !== slug);
      this.namespace = '';
      this.dismiss();
      this.notice = `${slug} is deleted.`;
    } catch ({ message }) {
      this.failure = message;
    }
  },

  async create() {
    try {
      const created = await call('auth/namespaces/create', { slug: this.slug, unlisted: this.unlisted });

      this.mine = [...this.mine, created];
      this.dismiss();
      this.notice = `${created.slug} is yours and has its own tab now.`;
    } catch ({ message }) {
      this.failure = message;
    }
  },

  draw() {
    this.draft = { title: '', description: '' };
    this.failure = '';
    document.querySelector('dialog[component]').showModal();
  },

  // Created with nothing published, the component page opens it as an
  // unpublished edit, so v1 is one press of Publish away.
  async add() {
    if (!lettered(this.draft.title)) return (this.failure = 'A name needs at least 3 letters');

    try {
      const { namespace, slug } = await call('auth/components/create', { namespace: this.namespace, ...this.draft });

      location.assign(`/${path(namespace, slug)}`);
    } catch ({ message }) {
      this.failure = message;
    }
  },
};

const refresh = async () => {
  if (!window.$.user) {
    window.$.mine = [];
    window.$.owned = [];
    window.$.namespace = '';
    return;
  }

  [window.$.mine, window.$.owned] = await Promise.all([call('auth/namespaces/mine'), call('auth/components/mine')]);
};

export const load = async () => {
  await refresh();

  window.$.on('afterUpdate', (current, previous) => current.user !== previous.user && refresh());
};
