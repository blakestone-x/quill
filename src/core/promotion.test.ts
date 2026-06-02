import { describe, it, expect } from 'vitest';
import { buildCartographProposal, buildProposals } from './promotion';
import type { Extraction, ExtractionKind, ExtractionStatus } from './domain';

let n = 0;
function ex(kind: ExtractionKind, summary: string, status: ExtractionStatus = 'confirmed'): Extraction {
  return {
    id: `e${n++}`,
    sessionId: 's1',
    kind,
    payload: { summary },
    confidence: 0.8,
    status,
    createdAt: 0
  };
}

describe('buildCartographProposal', () => {
  it('promotes a confirmed knowledge_write to a semantic reference proposal', () => {
    const p = buildCartographProposal(ex('knowledge_write', 'CBRE uses FMPilot for dispatch'));
    expect(p?.tier).toBe('semantic');
    expect(p?.kind).toBe('reference');
    expect(p?.frontmatter.source).toBe('quill');
    expect(p?.frontmatter.needs_review).toBe(true);
    expect(p?.needsReview).toBe(true);
  });

  it('promotes a confirmed decision to an episodic decision proposal', () => {
    const p = buildCartographProposal(ex('decision', 'We will ship Friday'));
    expect(p?.tier).toBe('episodic');
    expect(p?.kind).toBe('decision');
  });

  it('never targets the procedural tier', () => {
    const tiers = [
      buildCartographProposal(ex('knowledge_write', 'x')),
      buildCartographProposal(ex('decision', 'y'))
    ].map((p) => p?.tier);
    expect(tiers).not.toContain('procedural');
  });

  it('drops pending items and non-knowledge kinds', () => {
    expect(buildCartographProposal(ex('knowledge_write', 'x', 'pending'))).toBeNull();
    expect(buildCartographProposal(ex('action_item', 'do x'))).toBeNull();
    expect(buildCartographProposal(ex('knowledge_write', '   '))).toBeNull();
  });
});

describe('buildProposals', () => {
  it('keeps only eligible extractions', () => {
    const proposals = buildProposals([
      ex('knowledge_write', 'keep me'),
      ex('action_item', 'drop me'),
      ex('decision', 'keep me too')
    ]);
    expect(proposals).toHaveLength(2);
  });
});
