import { postIdCandidates } from './comment-automation.match';
import { CommentAutomationRepository } from './comment-automation.repository';

describe('postIdCandidates', () => {
  it('a bare id is exact and also matches a rule stored composite (suffix)', () => {
    expect(postIdCandidates('122233333388050885')).toEqual({
      exact: ['122233333388050885'],
      suffix: '_122233333388050885',
    });
  });

  it('a composite id yields both shapes exact, no suffix needed', () => {
    expect(postIdCandidates('1000PAGE_122233333388050885')).toEqual({
      exact: ['1000PAGE_122233333388050885', '122233333388050885'],
      suffix: null,
    });
  });

  it('an Instagram media id (no underscore) behaves as a plain exact match', () => {
    expect(postIdCandidates('18127332268867714').exact).toEqual(['18127332268867714']);
  });

  it('empty input yields nothing, so only channel-wide rules apply', () => {
    expect(postIdCandidates('')).toEqual({ exact: [], suffix: null });
  });
});

describe('CommentAutomationRepository.getActiveRulesForIntegration post-id matching', () => {
  const make = () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repo = new CommentAutomationRepository(
      { model: { commentAutomationRule: { findMany } } } as any,
      {} as any,
      {} as any
    );
    return { repo, findMany };
  };

  it('queries post-specific rules by bare/composite candidates and the suffix form', async () => {
    const { repo, findMany } = make();
    await repo.getActiveRulesForIntegration('int-1', 'COMMENT', '122233333388050885');
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { providerPostId: { in: ['122233333388050885'] } },
      { providerPostId: { endsWith: '_122233333388050885' } },
    ]);
    // second query is the channel-wide one
    expect(findMany.mock.calls[1][0].where.providerPostId).toBeNull();
  });

  it('without a post id only the channel-wide query runs', async () => {
    const { repo, findMany } = make();
    await repo.getActiveRulesForIntegration('int-1', 'COMMENT', undefined);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
