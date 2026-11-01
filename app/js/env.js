// A Workers preview is served at `<alias>-vibe-select.vibe-select.workers.dev`;
// production's own workers.dev host is `vibe-select.vibe-select.workers.dev`, without
// the alias, so the leading dash tells them apart.
export const PREVIEW = window.location.hostname.endsWith('-vibe-select.vibe-select.workers.dev');

// One Worker serves the site, the socket and the component source, so the page's
// own origin is all three on every host: production, a pull request's preview
// and `bun dev` alike, each reading the D1 its Worker binds.
export const ORIGIN = window.location.origin;

// The Worker that serves this site also answers the socket, at `/ws`.
export const WS_URL = `${ORIGIN.replace(/^http/, 'ws')}/ws`;

// Where a component's own source lives. This is the origin that ends up inside
// every `<component src>` a visitor copies off the site.
export const SOURCE_URL = ORIGIN;
