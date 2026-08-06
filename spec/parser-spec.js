const { parse } = require("../src/selector-kit");

describe("parse", function () {
  it("returns null for null and undefined", function () {
    expect(parse(null)).toBe(null);
    expect(parse(undefined)).toBe(null);
  });

  it("splits comma-separated expressions", function () {
    const parsed = parse(".foo, .bar");
    expect(parsed.length).toBe(2);
    expect(parsed[0].toString()).toBe("*.foo");
    expect(parsed[1].toString()).toBe("*.bar");
  });

  it("defaults a part's tag to '*'", function () {
    expect(parse(".foo")[0][0].tag).toBe("*");
    expect(parse("div.foo")[0][0].tag).toBe("div");
  });

  it("deduplicates and sorts class names, keeping both forms", function () {
    const part = parse(".b.a.b")[0][0];
    expect(part.classList).toEqual(["a", "b"]);
    expect(Object.keys(part.classes).sort()).toEqual(["a", "b"]);
  });

  it("unescapes class names so punctuated scopes round-trip", function () {
    const part = parse(".c\\+\\+")[0][0];
    // `classList` carries the plain scope name; `classes` carries the form that
    // is safe to splice into a regular expression, which is why a scope such as
    // `c++` survives at all.
    expect(part.classList).toEqual(["c++"]);
    expect(part.classes["c++"]).toBe(String.raw`c\\\+\\\+`);
  });

  it("records the combinator on each part", function () {
    const expression = parse(".foo > .bar")[0];
    expect(expression[0].combinator).toBe(" ");
    expect(expression[1].combinator).toBe(">");
    expect(parse(".foo .bar")[0][1].combinator).toBe(" ");
  });

  it("parses attributes and pseudo-selectors", function () {
    const part = parse("[foo=bar]:not(.baz)")[0][0];
    expect(part.attributes[0].name).toBe("foo");
    expect(part.attributes[0].value).toBe("bar");
    expect(part.pseudos[0].name).toBe("not");
    expect(part.pseudos[0].value).toBe(".baz");
  });

  it("parses an id without letting it affect matching", function () {
    expect(parse("#foo")[0][0].id).toBe("foo");
  });

  describe("when the expression is invalid", function () {
    it("yields an empty result rather than looping forever", function () {
      // The original parser spun forever here; the guard is the whole reason
      // Atom forked Slick in the first place.
      expect(parse("()").length).toBe(0);
      expect(parse("[").length).toBe(0);
    });
  });

  describe("caching", function () {
    it("returns the same parse result for the same source", function () {
      expect(parse(".cached-source")).toBe(parse(".cached-source"));
      expect(parse("  .cached-source  ")).toBe(parse(".cached-source"));
    });

    it("does not confuse a selector with an Object.prototype member name", function () {
      // A plain object as the cache table made `parse("toString")` hand back
      // `Object.prototype.toString`.
      const parsed = parse("toString");
      expect(typeof parsed).toBe("object");
      expect(parsed.length).toBe(1);
      expect(parsed[0][0].tag).toBe("toString");

      expect(parse("constructor")[0][0].tag).toBe("constructor");
      expect(parse("hasOwnProperty")[0][0].tag).toBe("hasOwnProperty");
    });

    it("keeps working past the cache bound", function () {
      for (let i = 0; i < 1200; i++) parse(`.bound-${i}`);
      const parsed = parse(".bound-0");
      expect(parsed.length).toBe(1);
      expect(parsed[0][0].classList).toEqual(["bound-0"]);
    });
  });

  describe("iteration", function () {
    it("iterates expressions and parts with for..of", function () {
      const expressions = [...parse(".foo .bar, .baz")];
      expect(expressions.length).toBe(2);
      expect([...expressions[0]].length).toBe(2);
      expect([...expressions[1]].length).toBe(1);
    });
  });
});
