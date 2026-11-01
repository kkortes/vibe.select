// Auto tags are read off a revision's markup, so they describe what the code
// does rather than what its author says it does.

const scripts = (html) => [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(([, code]) => code);

// The text from the bracket at `start` through the one that closes it, found by
// depth rather than a regex so nested brackets stay inside it.
const enclosed = (code, start) => {
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    depth += '{[('.includes(code[i]) - '}])'.includes(code[i]);
    if (!depth) return code.slice(start, i + 1);
  }
  return code.slice(start);
};

// An arrow's expression body runs to the `;` or the bracket that ends it.
const expression = (code) => {
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    depth += '{[('.includes(code[i]) - '}])'.includes(code[i]);
    if (depth < 0 || (!depth && code[i] === ';')) return code.slice(0, i);
  }
  return code;
};

// The object handed to component(), braces and all.
const stateOf = (code) => {
  const start = code.indexOf('component({');
  return start < 0 ? '' : enclosed(code, start + 'component('.length);
};

const logic = /=>|\bfunction\b|\w+\s*\([^)]*\)\s*\{/;

// Script beyond importing vibe and handing component() plain data.
const js = (html) =>
  scripts(html).some((code) => {
    const state = stateOf(code);
    const rest = code
      .replace(/^\s*import\s[^;]*['"]@ape-egg\/vibe[^'"]*['"];?\s*$/gm, '')
      .replace(`component(${state});`, '')
      .replace(`component(${state})`, '')
      .trim();
    return Boolean(rest) || logic.test(state);
  });

// Anything assigned to or stepped on `this` is state that changes at runtime.
const state = (html) => /this\.\w+\s*(?:[-+*/]?=(?!=)|\+\+|--)|(?:\+\+|--)this\.\w+/.test(html);

const split = (list) => {
  let depth = 0;
  return [...list].reduce(
    (parts, char) => {
      depth += '{[('.includes(char) - '}])'.includes(char);
      char === ',' && !depth ? parts.push('') : (parts[parts.length - 1] += char);
      return parts;
    },
    [''],
  );
};

const merge = (a, b) =>
  Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => [key, merge(a[key] ?? {}, b[key] ?? {})]));

// What a destructuring pattern reads, as a tree of the names it reaches:
// `{ detail: { type, message } }` reads detail.type and detail.message.
const pattern = (text) =>
  split(text.trim().slice(1, -1))
    .map((entry) => entry.trim().match(/^(\w+)\s*(?::\s*(\{[\s\S]*))?/))
    .filter(Boolean)
    .reduce((tree, [, key, nested]) => merge(tree, { [key]: nested ? pattern(enclosed(nested, 0)) : {} }), {});

// What a body reads off the variable `name`: its dotted paths, a trailing call
// dropped (`event.code.toLowerCase()` reads event.code), and what is
// destructured from it.
const read = (body, name) => {
  const paths = [...body.matchAll(new RegExp(`(?<![\\w$.])${name}((?:\\s*\\.\\s*\\w+)+)(\\s*\\()?`, 'g'))].map(([, path, call]) =>
    path.split('.').map((key) => key.trim()).filter(Boolean).slice(0, call ? -1 : undefined),
  );
  const destructured = [...body.matchAll(/\b(?:const|let|var)\s*(?=\{)/g)]
    .map(({ index, 0: keyword }) => index + keyword.length)
    .map((start) => [enclosed(body, start), start])
    .filter(([text, start]) => new RegExp(`^\\s*=\\s*${name}\\b`).test(body.slice(start + text.length)))
    .map(([text]) => pattern(text));
  return [...paths.map((path) => path.reduceRight((tree, key) => ({ [key]: tree }), {})), ...destructured].reduce(merge, {});
};

// A function expression starting at `at`: what its first parameter reads.
const reads = (code, at) => {
  const source = code.slice(at).replace(/^\s*(?:async\b\s*)?(?:function\b\s*)?/, '');
  const params = source[0] === '(' ? enclosed(source, 0) : source.match(/^\w*/)[0];
  const after = source.slice(params.length).replace(/^\s*(?:=>)?\s*/, '');
  const body = after[0] === '{' ? enclosed(after, 0) : expression(after);
  const [first = ''] = split(params.replace(/^\((.*)\)$/s, '$1'));
  return first.trim()[0] === '{' ? pattern(first) : first.trim() ? read(body, first.trim()) : {};
};

// The handler handed to addEventListener at `at`: written inline, or a name
// whose function is defined in the same script.
const handler = (code, at) => {
  const name = code.slice(at).match(/^\s*(\w+)\s*[,)]/)?.[1];
  if (!name) return reads(code, at);
  const definition = code.match(new RegExp(`\\b(?:(?:const|let|var)\\s+${name}\\s*=|function\\s+${name})`));
  return definition ? reads(code, definition.index + definition[0].length) : {};
};

export const KEYBOARD = ['keydown', 'keyup', 'keypress'];

// A value the markup compares a field with, as Overlay holds `code === 'Escape'`.
const literal = (html, field) =>
  html.match(new RegExp(`\\b${field}\\s*===?\\s*(['"\`])([^'"\`]*)\\1`))?.[2] ??
  html.match(new RegExp(`(['"\`])([^'"\`]*)\\1\\s*===?\\s*[\\w.]*\\b${field}\\b`))?.[2];

const filled = (html, tree) =>
  Object.fromEntries(Object.entries(tree).map(([key, sub]) => [key, Object.keys(sub).length ? filled(html, sub) : literal(html, key) ?? key]));

// The event its handlers would act on: a keyboard event's key and code, or the
// detail of any other. Each field takes a value the markup compares it with,
// or failing that a real key for a keyboard event and its own name for detail.
const example = (html, event, tree) => {
  const fields = KEYBOARD.includes(event)
    ? Object.fromEntries(['key', 'code'].filter((key) => tree[key]).map((key) => [key, literal(html, key) ?? 'Enter']))
    : filled(html, tree.detail ?? {});
  return Object.keys(fields).length ? fields : undefined;
};

// Listeners a component attaches to the window or the document, the two
// targets the page it lands in can reach and dispatch to. A bare
// addEventListener is the window's.
export const listeners = (html) => {
  const found = scripts(html).flatMap((code) =>
    [...code.matchAll(/(?:\b(window|document|globalThis|self)\s*\.\s*|(?<![\w$.]))addEventListener\(\s*(['"`])([\w:.-]+)\2\s*,/g)].map(
      ({ 1: target, 3: event, index, 0: call }) => ({
        target: target === 'document' ? 'document' : 'window',
        event,
        tree: handler(code, index + call.length),
      }),
    ),
  );
  return Object.values(Object.groupBy(found, ({ target, event }) => `${target} ${event}`)).map((group) => {
    const [{ target, event }] = group;
    return { target, event, example: example(html, event, group.map(({ tree }) => tree).reduce(merge)) };
  });
};

const styled = (html) => /<style[\s>]|\sstyle=/.test(html);

export const TAGS = ['Props', 'State', 'JS', 'Functions', 'CSS', 'Dependencies', 'Stylecheat'];

// User tags: the category an author files a component under.
export const CATEGORIES = ['Interactive', 'Forms', 'Layout', 'Navigation', 'Feedback', 'Presentation', 'Game'];

// Dependencies are named by the author rather than read off the markup: a
// `<component src>` may point anywhere, and only the author knows which of them
// are vibe.select components.
export const autoTags = ({ html, props, dependencies }) =>
  [
    props?.length && 'Props',
    state(html) && 'State',
    js(html) && 'JS',
    listeners(html).length && 'Functions',
    styled(html) && 'CSS',
    dependencies?.length && 'Dependencies',
  ].filter(Boolean);

// Stylecheat is a promise about the page a component lands in, not something
// read off its markup, so its tag rides on the component's saved styling.
export const stylingTags = (styling) => (styling === 'stylecheat' ? ['Stylecheat'] : []);
