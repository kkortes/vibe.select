import { ORIGIN } from '/js/env.js';

// A preview is the page a consumer would have: a document of its own, holding
// Vibe, Stylecheat when the component or one it renders is styled by it, and
// nothing of this site's. In this page's own document every stylesheet here,
// and the <style> of every other component mounted on it, would reach the
// preview too.
const page = ({ tag, values, stylecheat, dark }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <base href="${ORIGIN}/" />
  ${stylecheat ? '<link rel="stylesheet" href="/css/stylecheat.css" />' : ''}
  <style>
    html { height: 100%; display: grid; align-content: center; }
    body { margin: 0; padding: 8vw; display: grid; place-items: center; background: none; }
  </style>
  <script type="module">
    import vibe from '/modules/vibe/index.js';

    await vibe({ values: ${JSON.stringify(values).replaceAll('<', '\\u003c')} }, { noCache: true }).ready;
    frameElement.dispatchEvent(new Event('ready'));
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
// A frame has no height of its own content, so it takes its body's as its
// minimum and grows its preview box to fit, as the component inline did. Its
// viewport is whole pixels, so that height is rounded up: offsetHeight rounds
// to nearest, and a body a fraction taller than its frame scrolls it whenever
// the frame sits between pixels, as it does while the hero shrinks.
export default (host, { src, attributes, children = '', after = '', stylecheat, read }) => {
  const attrs = attributes.map((name) => `${name}="@[values.${name}]"`).join(' ');
  const frame = document.createElement('iframe');
  let view;

  // Until the frame's Vibe is ready there is no state in it to push to; ready
  // pushes whatever changed meanwhile. It is the frame's own ready, not its
  // load: Vibe's modules await at the top level, so load can fire before the
  // frame's module has even run.
  const sync = () => {
    if (!view) return;
    const { values, dark } = read();
    view.document.body.classList.toggle('dark', dark);
    Object.entries(view.JSON.parse(JSON.stringify(values))).forEach(
      ([name, value]) => JSON.stringify(value) !== JSON.stringify(view.$.values[name]) && (view.$.values[name] = value),
    );
  };

  frame.src = URL.createObjectURL(
    new Blob([page({ tag: `<component src="${src}" ${attrs}>${children}</component>${after}`, stylecheat, ...read() })], { type: 'text/html' }),
  );
  frame.addEventListener('ready', () => {
    URL.revokeObjectURL(frame.src);
    view = frame.contentWindow;
    new view.ResizeObserver(([{ borderBoxSize }]) => (frame.style.minHeight = `${Math.ceil(borderBoxSize[0].blockSize)}px`)).observe(view.document.body);
    sync();
  }, { once: true });
  host.replaceChildren(frame);

  return sync;
};
