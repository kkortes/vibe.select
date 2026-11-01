// `json` is the type for a prop an attribute cannot spell: an array or an
// object. It is passed by binding rather than as a literal, which is what the
// docs and the copyable snippet both show. `html` is no attribute at all: it is
// the markup between the tags, which the component renders through its <slot>.
// Its `after` is example markup that sits after the closing tag, such as an
// element outside the component that calls into it.
const TYPES = ['text', 'number', 'boolean', 'select', 'json', 'html'];

// The frozen truth about props lives on the revision. `defaults` is the copy
// every component list carries, so a card can render a live preview without fetching
// a revision per card.
export const defaults = (props = []) =>
  Object.fromEntries(props.map(({ name, default: value }) => [name, value]));

export const validate = (props) => {
  if (!Array.isArray(props)) throw Error('Props must be a list');

  if (props.filter(({ type }) => type === 'html').length > 1)
    throw Error('Only one prop can be html: a tag has one place between its tags');

  return props.map(({ name, type, default: value, description = '', options = [], after }) => {
    // An attribute name is lowercased by the HTML parser, and vibe matches prop
    // names case-insensitively, so camelCase is a real and common way to write
    // one. What an attribute genuinely cannot carry is whitespace.
    if (!/^[a-z][a-zA-Z0-9-]*$/.test(String(name)))
      throw Error(`"${name}" is not a usable prop name — start lowercase, then letters, digits or dashes`);

    if (!TYPES.includes(type)) throw Error(`Prop "${name}" needs a type: ${TYPES.join(', ')}`);

    if (type === 'select' && !options.length)
      throw Error(`Prop "${name}" is a select and needs options`);

    if (type === 'json' && (value === null || typeof value !== 'object'))
      throw Error(`Prop "${name}" is json and needs an array or object default`);

    if (type === 'html' && typeof value !== 'string')
      throw Error(`Prop "${name}" is html and needs markup as its default`);

    if (after !== undefined && (type !== 'html' || typeof after !== 'string'))
      throw Error(`Prop "${name}" can only carry markup after the tag as an html prop`);

    return { name, type, default: value, description, ...(type === 'select' && { options }), ...(after && { after }) };
  });
};
