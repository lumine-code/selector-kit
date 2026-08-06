// Selector parser, derived from the Slick parser originally created by Thomas
// Aylott (http://subtlegradient.com) and carried by Atom as `atom-slick`.
//
// This parses a CSS-like selector into an array-like `Expressions` of
// `Expression`s, each an array-like of `Part`s. It is deliberately *not* a
// standards-compliant CSS parser:
//
// - a Part's `tag` defaults to "*" rather than being absent, so `.foo` matches
//   a scope with any tag;
// - class names are deduplicated and sorted, and kept in both unescaped
//   (`classList`) and escaped (`classes`) form, which is what lets scope names
//   containing punctuation such as `c++` round-trip;
// - parsing is total: an expression the regex cannot advance through yields an
//   empty result rather than throwing. Selectors come from package manifests
//   and from scope descriptors, so a malformed one must not take the renderer
//   down or hang it.

const escapeRe = /([-.*+?^${}()|[\]/\\])/g;
const unescapeRe = /\\/g;

function escapeString(string) {
  return `${string}`.replace(escapeRe, "\\$1");
}

function unescapeString(string) {
  return `${string}`.replace(unescapeRe, "");
}

const slickRe = RegExp(
  [
    "^(?:",
    "\\s*(,)\\s*", // Separator
    "|\\s*(<combinator>+)\\s*", // Combinator
    "|(\\s+)", // CombinatorChildren
    "|(<unicode>+|\\*)", // Tag
    "|\\#(<unicode>+)", // ID
    "|\\.(<unicode>+)", // ClassName
    "|\\[\\s*(<unicode1>+)(?:\\s*([*^$!~|]?=)(?:\\s*(?:([\"']?)(.*?)\\9)))?\\s*\\](?!\\])", // Attribute
    "|(:+)(<unicode>+)(?:\\((?:(?:([\"'])([^\\13]*)\\13)|((?:\\([^)]+\\)|[^()]*)+))\\))?", // Pseudo
    ")",
  ]
    .join("")
    .replace(/<combinator>/, "[" + escapeString(">+~`!@$%^&={}\\;</") + "]")
    .replace(/<unicode>/g, "(?:[\\w\\u00a1-\\uFFFF-]|\\\\[^\\s0-9a-f])")
    .replace(/<unicode1>/g, "(?:[:\\w\\u00a1-\\uFFFF-]|\\\\[^\\s0-9a-f])"),
);

class Part {
  constructor(combinator) {
    this.combinator = combinator || " ";
    this.tag = "*";
  }

  toString() {
    if (!this.raw) {
      let xpr = this.tag || "*";
      if (this.id) xpr += "#" + this.id;
      if (this.classes) xpr += "." + this.classList.join(".");
      if (this.attributes) {
        for (const part of this.attributes) {
          xpr +=
            "[" + part.name + (part.operator ? part.operator + '"' + part.value + '"' : "") + "]";
        }
      }
      if (this.pseudos) {
        for (const part of this.pseudos) {
          xpr += ":" + part.name;
          if (part.value) xpr += "(" + part.value + ")";
        }
      }
      this.raw = xpr;
    }

    return this.raw;
  }
}

class Expression {
  constructor() {
    this.length = 0;
  }

  // Array-like by construction (dense numeric indices plus `length`); made
  // iterable so callers can walk it with for..of rather than an index loop.
  *[Symbol.iterator]() {
    for (let i = 0; i < this.length; i++) yield this[i];
  }

  toString() {
    if (!this.raw) {
      let xpr = "";
      for (let j = 0; j < this.length; j++) {
        const bit = this[j];
        if (j !== 0) xpr += " ";
        if (bit.combinator !== " ") xpr += bit.combinator + " ";
        xpr += bit;
      }
      this.raw = xpr;
    }

    return this.raw;
  }
}

function replacer(
  rawMatch,
  separator,
  combinator,
  combinatorChildren,
  tagName,
  id,
  className,
  attributeKey,
  attributeOperator,
  attributeQuote,
  attributeValue,
  pseudoMarker,
  pseudoClass,
  pseudoQuote,
  pseudoClassQuotedValue,
  pseudoClassValue,
) {
  let expression, current;

  if (separator || !this.length) {
    expression = this[this.length++] = new Expression();
    if (separator) return "";
  }

  if (!expression) expression = this[this.length - 1];

  if (combinator || combinatorChildren || !expression.length) {
    current = expression[expression.length++] = new Part(combinator);
  }

  if (!current) current = expression[expression.length - 1];

  if (tagName) {
    current.tag = unescapeString(tagName);
  } else if (id) {
    current.id = unescapeString(id);
  } else if (className) {
    const unescaped = unescapeString(className);
    const classes = current.classes || (current.classes = {});
    if (!classes[unescaped]) {
      classes[unescaped] = escapeString(className);
      const classList = current.classList || (current.classList = []);
      classList.push(unescaped);
      classList.sort();
    }
  } else if (pseudoClass) {
    const value = pseudoClassValue || pseudoClassQuotedValue;
    (current.pseudos || (current.pseudos = [])).push({
      type: pseudoMarker.length === 1 ? "class" : "element",
      name: unescapeString(pseudoClass),
      escapedName: escapeString(pseudoClass),
      value: value ? unescapeString(value) : null,
      escapedValue: value ? escapeString(value) : null,
    });
  } else if (attributeKey) {
    const escaped = attributeValue ? escapeString(attributeValue) : null;
    (current.attributes || (current.attributes = [])).push({
      operator: attributeOperator,
      name: unescapeString(attributeKey),
      escapedName: escapeString(attributeKey),
      value: escaped ? unescapeString(escaped) : null,
      escapedValue: escaped ? escapeString(escaped) : null,
    });
  }

  return "";
}

class Expressions {
  constructor(expression) {
    this.length = 0;

    let replacedExpression;
    while (expression) {
      replacedExpression = expression.replace(slickRe, (...args) => replacer.apply(this, args));
      if (replacedExpression === expression) {
        // The parser did not advance, so the expression is invalid. Drop every
        // expression parsed so far and bail out rather than looping forever.
        for (let i = 0; i < this.length; i++) {
          delete this[i];
        }
        this.length = 0;
        break;
      }
      expression = replacedExpression;
    }
  }

  *[Symbol.iterator]() {
    for (let i = 0; i < this.length; i++) yield this[i];
  }

  toString() {
    if (!this.raw) {
      const expressions = [];
      for (let i = 0; i < this.length; i++) expressions.push(this[i]);
      this.raw = expressions.join(", ");
    }

    return this.raw;
  }
}

// Parsing the same selector repeatedly is the norm -- every scope descriptor
// the editor builds is turned into a selector string and looked up again -- so
// results are memoized. Upstream never evicted, which let the table grow for
// the lifetime of the process; cap it and drop the oldest entry instead. A
// Selector holds its own AST directly, so an evicted entry never invalidates
// one already handed out.
const MAX_CACHE_ENTRIES = 1000;
const cache = new Map();

function parse(expression) {
  if (expression == null) return null;

  const source = `${expression}`.trim();

  const cached = cache.get(source);
  if (cached) return cached;

  const parsed = new Expressions(source);

  if (cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(source, parsed);

  return parsed;
}

module.exports = parse;
module.exports.Part = Part;
module.exports.Expression = Expression;
module.exports.Expressions = Expressions;
