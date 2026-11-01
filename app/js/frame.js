import { ORIGIN } from '/js/env.js';

// A preview is the page a consumer would have: a document of its own, holding
// Vibe, Stylecheat when the component is styled by it, and nothing of this
// site's. In this page's own document every stylesheet here, and the <style>
// of every other component mounted on it, would reach the preview too.
const page = ({ tag, values, stylecheat, dark }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <base href="${ORIGIN}/" />
  ${stylecheat ? '<link rel="stylesheet" href="/css/stylecheat.css" />' : ''}
  <style>
    body { box-sizing: border-box; min-height: 100vh; margin: 0; padding: 12vmin; display: grid; place-items: center; }
  </style>
  <script type="module">
    import vibe from '/modules/vibe/index.js';

    window.$ = vibe({ values: ${JSON.stringify(values).replaceAll('<', '\\u003c')} }, { noCache: true });
  </script>
</head>
<body${stylecheat ? ' stylecheat' : ''}${dark ? ' class="dark"' : ''} vibe-fouc>
${tag}
</body>
</html>`;

// Renders `<component src>` into a frame in `host`, every attribute bound to
// `values` in the frame's own state. `read` hands over the values and the theme
// as they are now; the returned sync pushes them into the frame, each value
// only once it changed, so an unchanged json prop never remounts the component.
export default (host, { src, attributes, children = '', after = '', styling, read }) => {
  const attrs = attributes.map((name) => `${name}="@[values.${name}]"`).join(' ');
  const frame = document.createElement('iframe');
  let view;

  // Until the frame has loaded there is no state in it to push to; loading
  // pushes whatever changed while it did.
  const sync = () => {
    if (!view) return;
    const { values, dark } = read();
    view.document.body.classList.toggle('dark', dark);
    Object.entries(view.JSON.parse(JSON.stringify(values))).forEach(
      ([name, value]) => JSON.stringify(value) !== JSON.stringify(view.$.values[name]) && (view.$.values[name] = value),
    );
  };

  frame.src = URL.createObjectURL(
    new Blob([page({ tag: `<component src="${src}" ${attrs}>${children}</component>${after}`, stylecheat: styling === 'stylecheat', ...read() })], { type: 'text/html' }),
  );
  frame.addEventListener('load', () => {
    URL.revokeObjectURL(frame.src);
    view = frame.contentWindow;
    sync();
  }, { once: true });
  host.replaceChildren(frame);

  return sync;
};
