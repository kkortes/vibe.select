import aaw from '@ape-egg/async-await-websockets/cloudflare/index.js';

import source from './source.js';
import store from './store.js';
import get from './events/components/get.js';
import list from './events/components/list.js';
import google from './events/login/google.js';
import preview from './events/login/preview.js';
import namespaces from './events/namespaces/list.js';
import createComponent from './events/auth/components/create.js';
import owned from './events/auth/components/mine.js';
import publish from './events/auth/components/publish.js';
import style from './events/auth/components/style.js';
import versions from './events/auth/components/versions.js';
import create from './events/auth/namespaces/create.js';
import remove from './events/auth/namespaces/delete.js';
import mine from './events/auth/namespaces/mine.js';
import unlist from './events/auth/namespaces/unlist.js';
import top from './events/tags/top.js';

// Google is the only way to get a session here, and it is stated rather than
// inherited: `providers: []` registers no social provider, so nothing answers an
// HTTP /auth/* route and the sole path to a token is this app's own
// `login/google` event, plus `login/preview` on previews only. aaw is kept for
// what it is good at — binding a session to a connection and guarding
// everything under auth/.
const socket = aaw(
  {
    'components/get': get,
    'components/list': list,
    'login/google': google,
    'login/preview': preview,
    'namespaces/list': namespaces,
    'tags/top': top,
    'auth/components/create': createComponent,
    'auth/components/mine': owned,
    'auth/components/publish': publish,
    'auth/components/style': style,
    'auth/components/versions': versions,
    'auth/namespaces/create': create,
    'auth/namespaces/delete': remove,
    'auth/namespaces/mine': mine,
    'auth/namespaces/unlist': unlist,
  },
  (env) => ({ db: env.DB, env }),
  ({ event, websocketKey, error }) => console.info(`${error ? '🔴' : '🟢'} ${event} | ${websocketKey}`),
  (env) => ({ providers: [], store: store(env.DB) }),
);

// Static assets answer first; what reaches the Worker is the socket at /ws and
// the component source.
export default {
  fetch: (request, env, ctx) =>
    new URL(request.url).pathname === '/ws' ? socket(request, env) : source.fetch(request, env, ctx),
};
