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
