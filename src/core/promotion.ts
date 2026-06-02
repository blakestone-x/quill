// Cartograph promotion (M7). Ambient-derived knowledge is never written straight
// into Cartograph's trusted tiers — it becomes a STAGED PROPOSAL tagged
// source:quill + needs_review, and NEVER procedural tier (Cartograph's safety
// boundary: "direct procedural-tier writes from ambient capture are forbidden").

import type { Extraction } from './domain';

export interface CartographProposal {
  tier: 'working' | 'episodic' | 'semantic'; // never 'procedural' from ambient
  kind: 'reference' | 'decision';
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  needsReview: true;
}

export function buildCartographProposal(e: Extraction): CartographProposal | null {
  if (e.status !== 'confirmed') return null;
  if (e.kind !== 'knowledge_write' && e.kind !== 'decision') return null;
  const summary = typeof e.payload.summary === 'string' ? e.payload.summary.trim() : '';
  if (!summary) return null;

  const isDecision = e.kind === 'decision';
  return {
    tier: isDecision ? 'episodic' : 'semantic',
    kind: isDecision ? 'decision' : 'reference',
    title: summary.slice(0, 80),
    body: summary,
    frontmatter: {
      source: 'quill',
      origin: 'ambient',
      session: e.sessionId,
      confidence: e.confidence,
      needs_review: true
    },
    needsReview: true
  };
}

/** Build proposals for a batch; non-eligible extractions are dropped. */
export function buildProposals(extractions: Extraction[]): CartographProposal[] {
  const out: CartographProposal[] = [];
  for (const e of extractions) {
    const p = buildCartographProposal(e);
    if (p) out.push(p);
  }
  return out;
}
