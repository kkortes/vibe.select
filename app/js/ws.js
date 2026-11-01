import aaw from '/modules/async-await-websockets/client.js';

import { WS_URL } from '/js/env.js';
import { get, set } from '/js/localStorage.js';

export let ws = null;

export const call = (event, payload) => ws.sendAsync(event, payload);

// Every marketplace read and write is an event on this socket. The only thing
// the site fetches over HTTP is a component's own source, because that is what
// `<component src>` does.
export const initWs = (onOpen) => {
  ws = aaw(WS_URL, { token: get('mkp-session') });

  // The client replays a stored token before `open` fires; this is where the
  // answer to that replay tells us who we are.
  ws.on('aaw/resume', ({ user }) => user && (window.$.user = user));

  ws.on('unauthorized', () => {
    set('mkp-session', null);
    window.$.user = null;
  });

  ws.on('open', async () => {
    window.$.wsConnected = true;
    window.$.authReady = true;

    // A page loads itself here, so this is the last place a refusal can still
    // be put in front of the visitor instead of only in the console.
    try {
      await onOpen?.();
    } catch ({ message }) {
      window.notify.error(message);
    }
  });

  // A socket that will not open is an answer too: nobody is signed in, and the
  // chrome should offer to sign in rather than spin on a session it cannot ask
  // about.
  ws.on('close', () => {
    window.$.wsConnected = false;
    window.$.authReady = true;
  });
};
