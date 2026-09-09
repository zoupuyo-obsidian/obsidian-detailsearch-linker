import type { ExtractSource } from './queryExtractor';

export interface ScoredAnchorInput {
	from: number;
	to: number;
	text: string;
	score: number;
	groupKey: string;
	source: ExtractSource;
	stableIndex: number;
	/** Final post-search candidate ranking; lower is better. */
	rank?: number;
}

function rangesOverlap(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
	return a.from < b.to && b.from < a.to;
}

/**
 * Greedy non-overlap selection across all auto candidates.
 * Priority: explicit focused markup → final candidate rank → extraction score.
 */
export function dedupeOverlappingAnchors(anchors: ScoredAnchorInput[]): ScoredAnchorInput[] {
	const sorted = [...anchors].sort(
		(a, b) =>
			focusedPriority(b.source) - focusedPriority(a.source) ||
			(a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
			b.score - a.score ||
			b.to - b.from - (a.to - a.from) ||
			a.from - b.from ||
			a.stableIndex - b.stableIndex,
	);
	const kept: ScoredAnchorInput[] = [];
	for (const cand of sorted) {
		if (cand.to <= cand.from) {
			continue;
		}
		if (kept.some((k) => rangesOverlap(k, cand))) {
			continue;
		}
		kept.push(cand);
	}
	return kept.sort((a, b) => a.from - b.from || a.stableIndex - b.stableIndex);
}

function focusedPriority(source: ExtractSource): number {
	return source === 'emphasis' || source === 'highlight'
		? 2
		: source === 'heading' ? 1 : 0;
}

export function anchorIdentity(from: number, to: number, groupKey: string): string {
	return `${groupKey}\0${from}\0${to}`;
}
