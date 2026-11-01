import { call } from '/js/ws.js';
import { PREVIEW } from '/js/env.js';
import { set } from '/js/localStorage.js';

const GOOGLE_CLIENT_ID =
  '615897294940-j7pp91r1bdn8j3v9l5k7rifrrhgodt5i.apps.googleusercontent.com';

const startSession = async (event, payload) => {
  try {
    const { token, user } = await call(event, payload);

    set('mkp-session', token);
    window.$.user = user;

    // Hand the fresh token to the socket client so an automatic reconnect
    // replays it. `aaw/resume` is the event that binds a token to a connection.
    await call('aaw/resume', { token });
  } catch ({ message }) {
    window.notify.error(message);
  }
};

const handleCredential = ({ credential }) => startSession('login/google', { token: credential });

const configure = () =>
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredential,
    auto_select: true,
  });

// On a preview, Sign in skips Google and the Worker signs in its PREVIEW_SIGNIN
// user, so previews can be signed into without a real Google account.
export const signIn = () => {
  if (PREVIEW) return startSession('login/preview');

  configure();
  google.accounts.id.prompt();
};

export const signOut = async () => {
  await call('aaw/logout');

  set('mkp-session', null);
  window.$.user = null;
  window.$.userMenuOpen = false;
  google.accounts.id.disableAutoSelect();
};

export const initAuth = () =>
  document.readyState === 'complete'
    ? configure()
    : window.addEventListener('load', configure);
