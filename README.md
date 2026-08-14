# selector-kit

Parses CSS-style scope selectors and matches them against scope chains.

The editor describes a position in a buffer as a scope chain — an array of TextMate scope names such as `['source.js', 'string.quoted']` — and packages target those positions with selectors that look like CSS: `.source.js .string`. This library parses one and answers whether it matches the other, and how specific the match was. It is what decides which autocomplete provider answers at the cursor and which scoped setting wins.

## Features

- **Selector parsing**: turns a comma-separated selector into an array-like of expressions, each an array-like of parts.
- **Scope-chain matching**: matches a selector against any suffix of a scope chain, with `>` restricting a part to the immediately preceding scope.
- **Dotted scope names**: parses `.source.js` as two classes on one part, so a selector matches a scope name by prefix without any special casing.
- **Escaped scopes**: keeps both the plain and the regex-safe form of every class, so scope names containing punctuation such as `c++` round-trip.
- **Negation**: supports `:not(...)`, including comma-separated branches inside it.
- **Specificity and ordering**: scores each selector and compares two of them, breaking ties in favour of the more recently created.
- **Total parsing**: an unparseable selector yields an empty result instead of throwing or looping, because selectors arrive from package manifests and from buffer state.

## Installation

```sh
npm install @lumine-code/selector-kit
```

## Usage

```js
const { Selector, parse } = require("@lumine-code/selector-kit");

// `create` returns one Selector per comma-separated branch.
const [selector] = Selector.create(".source.js .string");

selector.matches(".source.js .string.quoted.double"); // true
selector.matches(".source.js .comment"); // false
selector.specificity; // 32 -- three classes and two parts

// A scope chain is built by prefixing each scope name with a dot.
const scopeChain = `.${["source.js", "string.quoted"].join(" .")}`;
selector.matches(scopeChain); // true

// Selectors sort most-specific-first.
Selector.create(".a, .a.b")
  .sort((a, b) => a.compare(b))
  .map(String); // ['.a.b', '.a']

// The parser is exported for callers that want the AST directly.
parse(".source.js")[0][0].classList; // ['js', 'source']
```

## Specificity

The score is **not** CSS specificity, and the difference is deliberate — the editor's ordering has always been built on it:

- classes and attributes weigh the same,
- an `#id` is parsed but never contributes,
- every part contributes 1 for its tag,
- the result is `classes_and_attributes * 10 + parts`, in base 10, so ten classes carry into the column an id would otherwise occupy.

Changing the formula reorders which provider answers and which setting wins, so it is a compatibility surface rather than an implementation detail.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
