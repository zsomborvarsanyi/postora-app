import { matchComment, MatchableRule } from './comment-automation.match';

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
});
