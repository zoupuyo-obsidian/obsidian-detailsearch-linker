import type { DictionaryOrigin, ExtractedCandidate } from './queryExtractor';

export type CandidateLimitMode = 'adaptive' | 'fixed';

export interface MatchedAutoCandidate<T = unknown> {
	key: string;
	candidate: ExtractedCandidate;
	candidateNoteCount: number;
	payload: T;
	stableIndex: number;
}

export interface SelectedAutoCandidate<T = unknown> extends MatchedAutoCandidate<T> {
	rank: number;
}

export function autoCandidateProbeLimit(baseLimit: number): number {
	return Math.min(200, Math.max(120, baseLimit * 3));
}

function dictionaryPriority(origin: DictionaryOrigin | undefined): number {
	return origin === 'manual' ? 2 : origin === 'learned' ? 1 : 0;
}

function focusedPriority(candidate: ExtractedCandidate): number {
	return candidate.source === 'emphasis' || candidate.source === 'highlight'
		? 2
		: candidate.source === 'heading' ? 1 : 0;
}

/** Rejects URL/path/identifier-shaped entries from the single-word portfolio. */
export function isLexicalSingleWord(candidate: ExtractedCandidate): boolean {
	const term = candidate.query.trim();
	return candidate.kind === 'word'
		&& /^[\p{L}\p{M}\p{N}ー]+$/u.test(term)
		&& /\p{L}/u.test(term)
		&& !/^\p{N}+$/u.test(term);
}

function legacyCompare<T>(a: MatchedAutoCandidate<T>, b: MatchedAutoCandidate<T>): number {
	return b.candidate.score - a.candidate.score
		|| b.candidate.query.length - a.candidate.query.length
		|| a.stableIndex - b.stableIndex;
}

function focusedCompare<T>(a: MatchedAutoCandidate<T>, b: MatchedAutoCandidate<T>): number {
	return focusedPriority(b.candidate) - focusedPriority(a.candidate)
		|| legacyCompare(a, b);
}

function dictionaryCompare<T>(a: MatchedAutoCandidate<T>, b: MatchedAutoCandidate<T>): number {
	return dictionaryPriority(b.candidate.dictionaryOrigin) - dictionaryPriority(a.candidate.dictionaryOrigin)
		|| b.candidateNoteCount - a.candidateNoteCount
		|| b.candidate.anchors.length - a.candidate.anchors.length
		|| legacyCompare(a, b);
}

function wordCompare<T>(a: MatchedAutoCandidate<T>, b: MatchedAutoCandidate<T>): number {
	return b.candidateNoteCount - a.candidateNoteCount
		|| b.candidate.anchors.length - a.candidate.anchors.length
		|| legacyCompare(a, b);
}

function addUnseen<T>(
	out: MatchedAutoCandidate<T>[],
	seen: Set<string>,
	items: readonly MatchedAutoCandidate<T>[],
	count: number,
): void {
	for (const item of items) {
		if (out.length >= count || seen.has(item.key)) {
			continue;
		}
		seen.add(item.key);
		out.push(item);
	}
}

/**
 * Uses reserved portfolios before filling by existing extraction score. The
 * adaptive mode grows only while the current note remains visually sparse.
 */
export function selectMatchedAutoCandidates<T>(input: {
	candidates: readonly MatchedAutoCandidate<T>[];
	baseLimit: number;
	mode: CandidateLimitMode;
}): SelectedAutoCandidate<T>[] {
	const base = Math.max(1, Math.min(200, Math.round(input.baseLimit)));
	const focusedQuota = Math.floor(base * 0.5);
	const dictionaryQuota = Math.floor(base * 0.2);
	const wordQuota = base - focusedQuota - dictionaryQuota;
	const focused = input.candidates
		.filter((item) => focusedPriority(item.candidate) > 0)
		.sort(focusedCompare);
	const dictionary = input.candidates
		.filter((item) => dictionaryPriority(item.candidate.dictionaryOrigin) > 0)
		.sort(dictionaryCompare);
	const words = input.candidates.filter((item) => isLexicalSingleWord(item.candidate)).sort(wordCompare);
	const ordered: MatchedAutoCandidate<T>[] = [];
	const seen = new Set<string>();
	addUnseen(ordered, seen, focused, focusedQuota);
	addUnseen(ordered, seen, dictionary, focusedQuota + dictionaryQuota);
	addUnseen(ordered, seen, words, focusedQuota + dictionaryQuota + wordQuota);
	addUnseen(ordered, seen, [...input.candidates].sort(legacyCompare), Number.POSITIVE_INFINITY);

	const groupLimit = input.mode === 'fixed'
		? base
		: Math.min(200, Math.ceil(base * 1.5));
	const minimumGroups = input.mode === 'fixed' ? 0 : Math.max(1, Math.floor(base / 2));
	const anchorBudget = base * 2;
	const selected: SelectedAutoCandidate<T>[] = [];
	let anchorCount = 0;
	for (const item of ordered) {
		if (selected.length >= groupLimit) {
			break;
		}
		const nextAnchorCount = anchorCount + item.candidate.anchors.length;
		if (selected.length >= minimumGroups && input.mode === 'adaptive' && nextAnchorCount > anchorBudget) {
			continue;
		}
		selected.push({ ...item, rank: selected.length });
		anchorCount = nextAnchorCount;
	}
	return selected;
}
