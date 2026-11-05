import {
  matchComment,
  MatchableRule,
  pickReplyVariant,
  applyNamePlaceholder,
} from './comment-automation.match';

const rule = (overrides: Partial<MatchableRule>): MatchableRule => ({
  id: 'rule-id',
  active: true,
  matchType: 'CONTAINS' as any,
  triggers: '[]',
  publicReply: null,
  privateReply: null,
  ...overrides,
});

describe('matchComment', () => {
  it('returns null when there are no rules', () => {
    expect(matchComment([], 'hello')).toBeNull();
  });

  it('matches a CONTAINS rule case-insensitively', () => {
    const r = rule({ id: 'r1', triggers: JSON.stringify(['price', 'cost']) });
    expect(matchComment([r], 'What is the PRICE?')).toEqual(r);
    expect(matchComment([r], 'no match here')).toBeNull();
  });

  it('returns the first active match, in list order', () => {
    const first = rule({ id: 'first', triggers: JSON.stringify(['hello']) });
    const second = rule({ id: 'second', triggers: JSON.stringify(['hello']) });
    expect(matchComment([first, second], 'hello there')).toEqual(first);
  });

  it('skips inactive rules', () => {
    const inactive = rule({
      id: 'inactive',
      active: false,
      triggers: JSON.stringify(['hello']),
    });
    const active = rule({ id: 'active', triggers: JSON.stringify(['hello']) });
    expect(matchComment([inactive, active], 'hello there')).toEqual(active);
  });

  it('matches a REGEX rule', () => {
    const r = rule({
      id: 'regex-rule',
      matchType: 'REGEX' as any,
      triggers: JSON.stringify(['\\bprice\\b']),
    });
    expect(matchComment([r], 'the price is too high')).toEqual(r);
    expect(matchComment([r], 'pricetag')).toBeNull();
  });

  it('never throws and never matches on a malformed regex', () => {
    const r = rule({
      id: 'bad-regex',
      matchType: 'REGEX' as any,
      triggers: JSON.stringify(['(unclosed']),
    });
    expect(() => matchComment([r], 'anything')).not.toThrow();
    expect(matchComment([r], 'anything')).toBeNull();
  });

  it('never throws and never matches on malformed stored JSON', () => {
    const r = rule({ id: 'bad-json', triggers: 'not json' });
    expect(() => matchComment([r], 'anything')).not.toThrow();
    expect(matchComment([r], 'anything')).toBeNull();
  });

  it('matches an EXACT rule only when the whole message is the phrase', () => {
    const r = rule({
      id: 'exact-rule',
      matchType: 'EXACT' as any,
      triggers: JSON.stringify(['szia', 'hello']),
    });
    expect(matchComment([r], 'Szia')).toEqual(r);
    expect(matchComment([r], '  hello  ')).toEqual(r);
    expect(matchComment([r], 'szia, erdekel a termek')).toBeNull();
    expect(matchComment([r], 'hello there')).toBeNull();
  });

  describe('accent-insensitive matching (CONTAINS and EXACT)', () => {
    // Escapes keep the exact code points visible: U+00C8 is a grave E, not the
    // Hungarian U+00C9 - the real comment that slipped through was "\u00C8rdekel".
    const variants = [
      'erdekel',
      '\u00E9rdekel',
      '\u00C8rdekel',
      '\u00EArdekel',
      '\u00C9RDEKEL',
      'ERDEKEL',
      'E\u0300rdekel', // decomposed (E + combining grave)
    ];

    it.each(['CONTAINS', 'EXACT'])(
      'every accent variant matches the same unaccented trigger (%s)',
      (matchType) => {
        const r = rule({
          id: 'fold',
          matchType: matchType as any,
          triggers: JSON.stringify(['erdekel']),
        });
        for (const v of variants) {
          expect(matchComment([r], v)).toEqual(r);
        }
      }
    );

    it('matches inside a sentence on CONTAINS', () => {
      const r = rule({ id: 'fold', triggers: JSON.stringify(['erdekel']) });
      expect(matchComment([r], 'nagyon \u00C8rdekel engem')).toEqual(r);
      expect(matchComment([r], 'Nagyon \u00C9RDEKEL!')).toEqual(r);
    });

    it('works the other way round: accented trigger, unaccented comment', () => {
      const contains = rule({
        id: 'c',
        triggers: JSON.stringify(['\u00E9rdekel']),
      });
      const exact = rule({
        id: 'e',
        matchType: 'EXACT' as any,
        triggers: JSON.stringify(['\u00E9rdekel']),
      });
      expect(matchComment([contains], 'erdekel')).toEqual(contains);
      expect(matchComment([contains], 'nagyon erdekel engem')).toEqual(contains);
      expect(matchComment([exact], 'erdekel')).toEqual(exact);
      expect(matchComment([exact], '  ERDEKEL ')).toEqual(exact);
      expect(matchComment([exact], 'nagyon erdekel engem')).toBeNull();
    });

    // The bug class, not just one word: every Hungarian accented letter plus
    // the grave/circumflex lookalikes must fold to its base letter, in both
    // directions, upper and lower case.
    const letters: Array<[string, string]> = [
      ['\u00E1', 'a'], ['\u00E9', 'e'], ['\u00ED', 'i'], ['\u00F3', 'o'],
      ['\u00F6', 'o'], ['\u0151', 'o'], ['\u00FA', 'u'], ['\u00FC', 'u'],
      ['\u0171', 'u'],
      ['\u00E0', 'a'], ['\u00E8', 'e'], ['\u00EC', 'i'], ['\u00F2', 'o'],
      ['\u00F9', 'u'],
      ['\u00E2', 'a'], ['\u00EA', 'e'], ['\u00EE', 'i'], ['\u00F4', 'o'],
      ['\u00FB', 'u'],
    ];

    it('folds every accented letter to its base letter, both ways, any case', () => {
      for (const [accented, base] of letters) {
        for (const matchType of ['CONTAINS', 'EXACT']) {
          for (const [a, b] of [
            [accented, base],
            [base, accented],
            [accented.toUpperCase(), base],
            [accented, base.toUpperCase()],
          ]) {
            const r = rule({
              id: 'l',
              matchType: matchType as any,
              triggers: JSON.stringify(['x' + b + 'y']),
            });
            expect([matchType, a, matchComment([r], 'x' + a + 'y')]).toEqual([
              matchType,
              a,
              r,
            ]);
          }
        }
      }
    });

    it('does not dilute the filter: unrelated words and other letters stay null', () => {
      const r = rule({ id: 'n', triggers: JSON.stringify(['erdekel']) });
      expect(matchComment([r], 'k\u00F6sz\u00F6n\u00F6m')).toBeNull();
      expect(matchComment([r], 'nem k\u00E9rdez')).toBeNull();
      expect(matchComment([r], 'ordekel')).toBeNull();
      expect(matchComment([r], '\u00E9rdemel')).toBeNull();
    });

    it('documents the accepted trade-off: accents that distinguish words fold together', () => {
      // "\u00E1r" (price) and "ar" are different Hungarian words, but with
      // folding they are the same trigger. Accepted on purpose, see the fix commit.
      const r = rule({ id: 't', triggers: JSON.stringify(['\u00E1r']) });
      expect(matchComment([r], 'ara?')).toEqual(r);
      expect(matchComment([r], 'mennyi az \u00E1ra')).toEqual(r);
    });

    it('leaves the stored rule untouched (only the comparison is folded)', () => {
      const r = rule({ id: 'u', triggers: JSON.stringify(['\u00E9rdekel']) });
      const before = r.triggers;
      const hit = matchComment([r], '\u00C8rdekel');
      expect(hit).toBe(r);
      expect(hit?.triggers).toBe(before);
    });
  });

  describe('REGEX rules keep working (raw first, folded text as a fallback)', () => {
    it('still matches the raw text exactly as before', () => {
      const r = rule({
        id: 'rx',
        matchType: 'REGEX' as any,
        triggers: JSON.stringify(['\u00E9rdekel']),
      });
      expect(matchComment([r], 'nagyon \u00E9rdekel')).toEqual(r);
      expect(matchComment([r], 'semmi')).toBeNull();
    });

    it('an ASCII pattern now also matches an accented comment', () => {
      const r = rule({
        id: 'rx',
        matchType: 'REGEX' as any,
        triggers: JSON.stringify(['\\berdekel\\b']),
      });
      expect(matchComment([r], 'erdekel')).toEqual(r);
      expect(matchComment([r], '\u00C8rdekel')).toEqual(r);
      expect(matchComment([r], '\u00E9rdekel')).toEqual(r);
      expect(matchComment([r], 'erdekelne')).toBeNull();
    });

    it('stays case-insensitive and never throws on a bad pattern', () => {
      const ok = rule({
        id: 'ok',
        matchType: 'REGEX' as any,
        triggers: JSON.stringify(['ERDEKEL']),
      });
      expect(matchComment([ok], '\u00E9rdekel')).toEqual(ok);
      const bad = rule({
        id: 'bad',
        matchType: 'REGEX' as any,
        triggers: JSON.stringify(['(unclosed']),
      });
      expect(() => matchComment([bad], '\u00C8rdekel')).not.toThrow();
      expect(matchComment([bad], '\u00C8rdekel')).toBeNull();
    });
  });
});

describe('pickReplyVariant', () => {
  it('returns null for empty input', () => {
    expect(pickReplyVariant(null)).toBeNull();
    expect(pickReplyVariant(undefined)).toBeNull();
    expect(pickReplyVariant('')).toBeNull();
  });

  it('treats a plain (non-JSON) string as a single variant', () => {
    expect(pickReplyVariant('hello there')).toBe('hello there');
  });

  it('picks one of the stored JSON variants', () => {
    const variants = ['a', 'b', 'c'];
    for (let i = 0; i < 20; i++) {
      expect(variants).toContain(pickReplyVariant(JSON.stringify(variants)));
    }
  });

  it('eventually picks every variant across many calls', () => {
    const variants = ['a', 'b'];
    const seen = new Set<string | null>();
    for (let i = 0; i < 50; i++) {
      seen.add(pickReplyVariant(JSON.stringify(variants)));
    }
    expect(seen).toEqual(new Set(variants));
  });
});

describe('applyNamePlaceholder', () => {
  it('substitutes a known name with a leading space', () => {
    expect(applyNamePlaceholder('Szia {name}!', 'Zsombor')).toBe('Szia Zsombor!');
  });

  it('drops the placeholder and its leading space when the name is unknown', () => {
    expect(applyNamePlaceholder('Szia {name}!', undefined)).toBe('Szia!');
    expect(applyNamePlaceholder('Szia {name}!', null)).toBe('Szia!');
    expect(applyNamePlaceholder('Szia {name}!', '')).toBe('Szia!');
  });

  it('handles multiple occurrences', () => {
    expect(applyNamePlaceholder('{name}, szia {name}!', 'Zsombor')).toBe(
      ' Zsombor, szia Zsombor!'
    );
  });

  it('leaves text with no placeholder untouched', () => {
    expect(applyNamePlaceholder('Szia!', 'Zsombor')).toBe('Szia!');
  });
});
