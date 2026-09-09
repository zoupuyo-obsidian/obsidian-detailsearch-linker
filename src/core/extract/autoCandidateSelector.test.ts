import assert from 'node:assert/strict';
import test from 'node:test';
import {
	autoCandidateProbeLimit,
	selectMatchedAutoCandidates,
	type MatchedAutoCandidate,
} from './autoCandidateSelector.ts';

function candidate(query: string, input: Partial<MatchedAutoCandidate> = {}): MatchedAutoCandidate {
	return {
		key: query,
		candidate: {
			query,
			displayText: query,
			source: 'prose',
			score: 400,
			anchors: [{ from: 0, to: query.length, text: query }],
			kind: 'phrase',
		},
		candidateNoteCount: 1,
		payload: undefined,
		stableIndex: 0,
		...input,
	};
}

test('default probe widens a 40-term display baseline to 120 terms', () => {
	assert.equal(autoCandidateProbeLimit(40), 120);
	assert.equal(autoCandidateProbeLimit(100), 200);
});

test('single-word portfolio keeps meaningful terms beyond legacy pre-search rank', () => {
	const noise = Array.from({ length: 84 }, (_, i) => candidate(`phrase${i}`, {
		candidate: {
			...candidate(`phrase${i}`).candidate,
			score: 900 - i,
		},
		stableIndex: i,
	}));
	const resistance = candidate('レジスタンス', {
		candidate: { ...candidate('レジスタンス').candidate, kind: 'word', score: 406 },
		candidateNoteCount: 80,
		stableIndex: 85,
	});
	const training = candidate('トレーニング', {
		candidate: { ...candidate('トレーニング').candidate, kind: 'word', score: 406 },
		candidateNoteCount: 80,
		stableIndex: 86,
	});
	const selected = selectMatchedAutoCandidates({
		candidates: [...noise, resistance, training],
		baseLimit: 40,
		mode: 'adaptive',
	});
	assert.ok(selected.some((item) => item.key === 'レジスタンス'));
	assert.ok(selected.some((item) => item.key === 'トレーニング'));
});

test('adaptive selection grows only while the anchor budget permits it', () => {
	const sparse = Array.from({ length: 70 }, (_, i) => candidate(`word${i}`, {
		candidate: { ...candidate(`word${i}`).candidate, kind: 'word' },
		stableIndex: i,
	}));
	const selected = selectMatchedAutoCandidates({ candidates: sparse, baseLimit: 40, mode: 'adaptive' });
	assert.equal(selected.length, 60);
	const dense = Array.from({ length: 70 }, (_, i) => candidate(`dense${i}`, {
		candidate: {
			...candidate(`dense${i}`).candidate,
			anchors: Array.from({ length: 10 }, (_, index) => ({ from: index * 10, to: index * 10 + 4, text: `dense${i}` })),
		},
		stableIndex: i,
	}));
	const limited = selectMatchedAutoCandidates({ candidates: dense, baseLimit: 40, mode: 'adaptive' });
	assert.equal(limited.length, 20);
});

test('manual dictionary candidates receive their reserved portfolio', () => {
	const selected = selectMatchedAutoCandidates({
		candidates: [
			...Array.from({ length: 50 }, (_, i) => candidate(`phrase${i}`, { stableIndex: i })),
			candidate('固有語', {
				candidate: { ...candidate('固有語').candidate, kind: 'dictionary', dictionaryOrigin: 'manual' },
				stableIndex: 51,
			}),
		],
		baseLimit: 40,
		mode: 'fixed',
	});
	assert.ok(selected.some((item) => item.key === '固有語'));
});
