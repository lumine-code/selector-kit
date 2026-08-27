const parse = require("./parser");

let indexCounter = 0;

// `parse` memoizes, so the same selector string always yields the same `Part`
// objects. Pseudo-selector parsing decorates those Parts, which must therefore
// happen exactly once per Part: upstream re-ran it on every `create()` and
// appended to `notSelectors` each time, so a selector re-created on a hot path
// accumulated duplicate negations without bound.
const parsedPseudos = new WeakSet();

// Matches a CSS-like selector against a scope chain.
//
// The matching rules are deliberately narrower than CSS, and the specificity
// is not CSS specificity -- both consumers order providers and configuration
// by the number this produces, so it is a compatibility surface, not an
// implementation detail. See `calculateSpecificity`.
module.exports = class Selector {
  // Public: Build one Selector per comma-separated branch of `source`.
  //
  // Returns an {Array} of {Selector}s.
  static create(source, options) {
    const selectors = [];

    for (const selectorAst of parse(source) ?? []) {
      for (const selectorComponent of selectorAst) {
        this.parsePseudoSelectors(selectorComponent);
      }
      selectors.push(new this(selectorAst, options));
    }

    return selectors;
  }

  static parsePseudoSelectors(selectorComponent) {
    if (selectorComponent.pseudos == null) return;
    if (parsedPseudos.has(selectorComponent)) return;
    parsedPseudos.add(selectorComponent);

    for (const pseudoClass of selectorComponent.pseudos) {
      if (pseudoClass.name === "not") {
        selectorComponent.notSelectors ??= [];
        selectorComponent.notSelectors.push(...this.create(pseudoClass.value));
      } else {
        console.warn(`Unsupported pseudo-selector: ${pseudoClass.name}`);
      }
    }
  }

  constructor(selector, options) {
    this.selector = selector;
    this.priority = options?.priority ?? 0;
    this.specificity = this.calculateSpecificity();
    this.index = indexCounter++;
  }

  // Public: Does this selector match the given scope chain?
  //
  // * `scopeChain` an {Expression} of parsed scope {Part}s, or a {String} to
  //   parse as one.
  //
  // Returns a {Boolean}.
  matches(scopeChain) {
    if (typeof scopeChain === "string") {
      scopeChain = parse(scopeChain)[0];
      if (scopeChain == null) return false;
    }

    let selectorIndex = this.selector.length - 1;
    let scopeIndex = scopeChain.length - 1;
    let requireMatch = true;

    while (selectorIndex >= 0 && scopeIndex >= 0) {
      if (
        this.selectorComponentMatchesScope(this.selector[selectorIndex], scopeChain[scopeIndex])
      ) {
        // Only `>` constrains the next component to the immediately preceding
        // scope; every other combinator is treated as a descendant.
        requireMatch = this.selector[selectorIndex].combinator === ">";
        selectorIndex--;
      } else if (requireMatch) {
        return false;
      }
      scopeIndex--;
    }

    return selectorIndex < 0;
  }

  selectorComponentMatchesScope(selectorComponent, scope) {
    if (selectorComponent.classList != null) {
      for (const className of selectorComponent.classList) {
        if (scope.classes?.[className] == null) return false;
      }
    }

    if (selectorComponent.tag != null) {
      if (!(selectorComponent.tag === scope.tag || selectorComponent.tag === "*")) {
        return false;
      }
    }

    if (selectorComponent.attributes != null) {
      const scopeAttributes = {};
      for (const attribute of scope.attributes ?? []) {
        scopeAttributes[attribute.name] = attribute;
      }
      for (const attribute of selectorComponent.attributes) {
        // The operator is deliberately ignored: `[a^=b]` matches as `[a=b]`.
        if (scopeAttributes[attribute.name]?.value !== attribute.value) return false;
      }
    }

    if (selectorComponent.notSelectors != null) {
      for (const selector of selectorComponent.notSelectors) {
        if (selector.matches([scope])) return false;
      }
    }

    return true;
  }

  // Public: Order two selectors, most specific first, breaking ties by
  // insertion order so a later registration wins.
  compare(other) {
    if (other.specificity !== this.specificity) return other.specificity - this.specificity;
    if (other.priority !== this.priority) return other.priority - this.priority;
    return other.index - this.index;
  }

  isEqual(other) {
    return this.toString() === other.toString();
  }

  // The specificity is also exposed as a property, but this accessor is the
  // form autocomplete's provider ordering calls. scoped-property-store's copy
  // of this class had dropped it.
  getSpecificity() {
    return this.specificity;
  }

  // Not CSS specificity. Classes and attributes weigh the same, IDs are parsed
  // but never counted, and the columns are base 10 rather than being kept
  // separate -- so ten classes carry into the column an ID would occupy.
  // Consumers sort by this value, so changing the formula reorders which
  // autocomplete provider answers and which configuration value wins.
  calculateSpecificity() {
    const a = 0;
    let b = 0;
    let c = 0;

    for (const selectorComponent of this.selector) {
      if (selectorComponent.classList != null) {
        b += selectorComponent.classList.length;
      }
      if (selectorComponent.attributes != null) {
        b += selectorComponent.attributes.length;
      }
      if (selectorComponent.tag != null) {
        c += 1;
      }
    }

    return a * 100 + b * 10 + c * 1;
  }

  // A Part's tag defaults to "*", so a class-only selector stringifies as
  // "*.foo"; strip that back off.
  toString() {
    return this.selector.toString().replace(/\*\./g, ".");
  }
};
