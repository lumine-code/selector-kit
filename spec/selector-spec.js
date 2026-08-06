const { Selector } = require("../src/selector-kit");

const S = (string) => Selector.create(string)[0];

describe("Selector", function () {
  describe("::matches(scopeChain)", function () {
    describe("for selectors with no combinators", function () {
      it("can match based on the class name of the rightmost element", function () {
        expect(S(".foo").matches(".bar .foo")).toBe(true);
        expect(S(".foo").matches(".foo .bar")).toBe(false);
        expect(S(".foo").matches(".bar .foo.bar")).toBe(true);
      });

      it("can match based on the type of the rightmost element", function () {
        expect(S("p").matches("div p")).toBe(true);
        expect(S("p").matches("div div")).toBe(false);
        expect(S("p").matches("div p.foo")).toBe(true);
      });

      it("can match based on the attributes of the rightmost element", function () {
        expect(S("[foo=bar][baz=qux]").matches("div [foo=bar][baz=qux]")).toBe(true);
        expect(S("[foo=bar][baz=qux]").matches("div [foo=bar]")).toBe(false);
      });

      it("allows selectors not specifying a specific tag to match scopes with specific tags", function () {
        expect(S(".foo").matches("div.foo")).toBe(true);
      });

      it("allows classes such as .c\\+\\+", function () {
        expect(S(".c\\+\\+").matches(".c\\+\\+")).toBe(true);
      });
    });

    describe("for selectors with descendant combinators", function () {
      it("matches based on the ancestors of the chain's rightmost element", function () {
        expect(S(".foo .bar").matches(".baz .foo .bar")).toBe(true);
        expect(S(".foo .bar").matches(".baz .bar")).toBe(false);
        expect(S(".foo .bar").matches(".foo .baz .bar")).toBe(true);
      });
    });

    describe("for selectors with child combinators", function () {
      it("matches based on the parent of the chain's rightmost element", function () {
        expect(S(".foo > .bar").matches(".baz .foo .bar")).toBe(true);
        expect(S(".foo > .bar").matches(".baz .bar")).toBe(false);
        expect(S(".foo > .bar").matches(".foo .baz .bar")).toBe(false);
      });
    });

    describe("for selectors with :not pseudoclasses", function () {
      it("does not match if the portion of the selector within the negation matches", function () {
        expect(S(".foo:not(.bar, .baz)").matches(".baz .foo.bar")).toBe(false);
        expect(S(".foo:not(.bar, .baz)").matches(".baz .foo.baz")).toBe(false);
        expect(S(".foo:not(.bar, .baz)").matches(".baz .foo.qux")).toBe(true);
      });

      it("does not accumulate duplicate negations when re-created", function () {
        // The parser memoizes, so every `create` of this string decorates the
        // same Part. Re-creating it must not append to `notSelectors` again.
        const source = ".dedupe-me:not(.bar, .baz)";
        const first = S(source);
        expect(first.selector[0].notSelectors.length).toBe(2);

        for (let i = 0; i < 5; i++) Selector.create(source);

        expect(first.selector[0].notSelectors.length).toBe(2);
        expect(S(source).matches(".foo.dedupe-me.bar")).toBe(false);
        expect(S(source).matches(".foo.dedupe-me.qux")).toBe(true);
      });
    });

    it("accepts an already-parsed scope chain", function () {
      const { parse } = require("../src/selector-kit");
      expect(S(".foo").matches(parse(".bar .foo")[0])).toBe(true);
      expect(S(".foo").matches(parse(".foo .bar")[0])).toBe(false);
    });

    it("returns false for an unparseable scope chain", function () {
      expect(S(".foo").matches("()")).toBe(false);
    });
  });

  describe("::toString()", function () {
    it("strips redundant '*' expressions", function () {
      expect(S(".foo").toString()).toBe(".foo");
      expect(S(".foo .bar").toString()).toBe(".foo .bar");
      expect(S("*").toString()).toBe("*");
    });
  });

  describe("::create(source)", function () {
    it("returns one selector per comma-separated branch", function () {
      const selectors = Selector.create(".foo, .bar .baz");
      expect(selectors.length).toBe(2);
      expect(selectors[0].toString()).toBe(".foo");
      expect(selectors[1].toString()).toBe(".bar .baz");
    });

    it("returns an empty array for an unparseable selector", function () {
      expect(Selector.create("()")).toEqual([]);
    });

    it("warns once about a pseudo-selector it does not support", function () {
      spyOn(console, "warn");
      Selector.create(".foo:hover");
      Selector.create(".foo:hover");
      expect(console.warn.calls.count()).toBe(1);
      expect(console.warn.calls.argsFor(0)[0]).toBe("Unsupported pseudo-selector: hover");
    });
  });

  describe("::getSpecificity() ordering", function () {
    it("exposes the specificity as both a property and an accessor", function () {
      // autocomplete's provider ordering calls the accessor; the copy this was
      // rewritten from only had the property.
      const selector = S(".foo.bar");
      expect(typeof selector.getSpecificity).toBe("function");
      expect(selector.getSpecificity()).toBe(selector.specificity);
    });

    it("scores classes and attributes equally, and counts the tag", function () {
      // Not CSS specificity: `b * 10 + c`, where every Part contributes a tag.
      expect(S("*").specificity).toBe(1);
      expect(S(".foo").specificity).toBe(11);
      expect(S(".foo.bar").specificity).toBe(21);
      expect(S("[a=b]").specificity).toBe(11);
      expect(S(".foo .bar").specificity).toBe(22);
    });

    it("never counts an id", function () {
      expect(S("#foo").specificity).toBe(1);
    });

    it("orders more specific selectors first, breaking ties by recency", function () {
      const general = S(".foo");
      const specific = S(".foo.bar");
      expect(specific.compare(general)).toBeLessThan(0);
      expect(general.compare(specific)).toBeGreaterThan(0);

      const earlier = S(".tie");
      const later = S(".tie");
      expect(later.compare(earlier)).toBeLessThan(0);
    });

    it("honours an explicit priority", function () {
      const low = Selector.create(".p", { priority: 0 })[0];
      const high = Selector.create(".p", { priority: 1000 })[0];
      expect(high.index).toBeGreaterThan(low.index);
    });
  });

  describe("::isEqual(other)", function () {
    it("compares the normalized selector source", function () {
      expect(S(".foo").isEqual(S(".foo"))).toBe(true);
      expect(S(".foo").isEqual(S(".bar"))).toBe(false);
      expect(S(".foo.bar").isEqual(S(".bar.foo"))).toBe(true);
    });
  });
});
