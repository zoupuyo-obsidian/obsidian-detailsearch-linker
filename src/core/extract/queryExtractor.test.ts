import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	extractQueryCandidates,
	groupKeyForQuery,
	HARD_CAP_AUTO_QUERIES,
	type ExtractSettings,
} from './queryExtractor.ts';

const BASE: ExtractSettings = {
	focusedExtraction: true,
	normalProsePhrases: false,
	broadNgram: false,
	minTermLength: 3,
	maxTermLength: 32,
	ngramMinLength: 2,
	ngramMaxLength: 4,
	maxAutoQueries: 40,
	ngramSpanLimit: 8,
	stopWords: ['the', 'の'],
	ignoredTerms: [],
	caseSensitive: false,
};

test('heading anchor range excludes markdown markers', () => {
	const text = '## Important Topic\n\nbody';
	const out = extractQueryCandidates(text, BASE);
	const heading = out.find((c) => c.source === 'heading');
	assert.ok(heading);
	assert.equal(text.slice(heading!.anchors[0]!.from, heading!.anchors[0]!.to), 'Important Topic');
	assert.equal(heading!.query, 'Important Topic');
});

test('bold and highlight anchors exclude markers', () => {
	const text = 'See **Bold Term** and ==Highlight== here';
	const out = extractQueryCandidates(text, BASE);
	const bold = out.find((c) => c.query === 'Bold Term');
	const hi = out.find((c) => c.query === 'Highlight');
	assert.ok(bold);
	assert.ok(hi);
	assert.equal(text.slice(bold!.anchors[0]!.from, bold!.anchors[0]!.to), 'Bold Term');
	assert.equal(text.slice(hi!.anchors[0]!.from, hi!.anchors[0]!.to), 'Highlight');
});

test('protected spans exclude code and links', () => {
	const text = '## Real\n\n`term` [[term]] and normal term here';
	const out = extractQueryCandidates(text, { ...BASE, normalProsePhrases: true });
	const queries = out.map((c) => c.query);
	assert.ok(queries.includes('Real'));
	assert.ok(!queries.includes('term') || out.filter((c) => c.query === 'term').every((c) => c.source !== 'ngram'));
});

test('prose extraction with unicode fallback words', () => {
	const text = 'Alpha beta gamma delta';
	const out = extractQueryCandidates(text, { ...BASE, normalProsePhrases: true });
	assert.ok(out.some((c) => c.query === 'Alpha'));
	assert.ok(out.some((c) => c.query === 'gamma'));
});

test('ngram settings respected when broad mode on', () => {
	const text = '認知負荷理論について';
	const out = extractQueryCandidates(text, {
		...BASE,
		focusedExtraction: false,
		broadNgram: true,
		ngramMinLength: 2,
		ngramMaxLength: 3,
		ngramSpanLimit: 4,
	});
	assert.ok(out.length > 0);
	assert.ok(out.every((c) => c.source === 'ngram'));
	assert.ok(out.every((c) => c.query.length >= 2 && c.query.length <= 3));
});

test('stop words excluded', () => {
	const text = '## the topic\n\n**の** word';
	const out = extractQueryCandidates(text, BASE);
	assert.ok(!out.some((c) => c.query === 'the'));
	assert.ok(!out.some((c) => c.query === 'の'));
});

test('duplicate terms merge and keep all anchors', () => {
	const text = '## Term\n\n**Term** again';
	const out = extractQueryCandidates(text, BASE);
	const term = out.find((c) => groupKeyForQuery(c.query, false) === groupKeyForQuery('Term', false));
	assert.ok(term);
	assert.equal(term!.anchors.length, 2);
});

test('priority prefers emphasis over heading', () => {
	const text = '## Topic\n\n**Topic**';
	const out = extractQueryCandidates(text, BASE);
	const topic = out.find((c) => c.query === 'Topic');
	assert.ok(topic);
	assert.equal(topic!.source, 'emphasis');
});

test('priority prefers heading over ngram', () => {
	const text = '## Topic\n\n認知負荷';
	const out = extractQueryCandidates(text, {
		...BASE,
		broadNgram: true,
		ngramMinLength: 2,
		ngramMaxLength: 4,
	});
	const topic = out.find((c) => c.query === 'Topic');
	assert.ok(topic);
	assert.equal(topic!.source, 'heading');
	const idxTopic = out.indexOf(topic!);
	const ngramIdx = out.findIndex((c) => c.source === 'ngram');
	if (ngramIdx >= 0) {
		assert.ok(idxTopic < ngramIdx);
	}
});

test('hard cap limits output regardless of maxAutoQueries setting', () => {
	const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
	const out = extractQueryCandidates(words, {
		...BASE,
		normalProsePhrases: true,
		maxAutoQueries: 500,
		minTermLength: 4,
	});
	assert.ok(out.length <= HARD_CAP_AUTO_QUERIES);
});

test('japanese and english mixed extraction', () => {
	const text = '## 日本語 Heading\n\nEnglish phrase here';
	const out = extractQueryCandidates(text, { ...BASE, normalProsePhrases: true });
	assert.ok(out.some((c) => c.query.includes('日本語')));
	assert.ok(out.some((c) => c.query === 'English'));
});

test('pushRaw trims anchor range for padded emphasis', () => {
	const text = '** term **';
	const out = extractQueryCandidates(text, BASE);
	const term = out.find((c) => c.query === 'term');
	assert.ok(term);
	const a = term!.anchors[0]!;
	assert.equal(text.slice(a.from, a.to), 'term');
	assert.equal(a.text, 'term');
});

test('prose extracts multi-word english phrase with spaces', () => {
	const text = 'cognitive load theory applies';
	const out = extractQueryCandidates(text, {
		...BASE,
		focusedExtraction: false,
		normalProsePhrases: true,
		minTermLength: 3,
	});
	const phrase = out.find((c) => c.query === 'cognitive load');
	assert.ok(phrase, 'expected cognitive load phrase');
	assert.equal(phrase!.source, 'prose');
	assert.ok(phrase!.score > (out.find((c) => c.query === 'cognitive')?.score ?? 0));
});

test('prose joins adjacent japanese word segments', () => {
	const text = '認知負荷について説明する';
	const out = extractQueryCandidates(text, {
		...BASE,
		focusedExtraction: false,
		normalProsePhrases: true,
		minTermLength: 2,
		maxTermLength: 12,
	});
	const phrase = out.find((c) => c.query === '認知負荷');
	assert.ok(phrase, 'expected combined 認知負荷 phrase');
});

test('repeated Japanese token survives a long line and the 40-query cap', () => {
	const sourceLine = 'ホエイプロテインとビタミンD3補給の筋への効果';
	const englishNoise = Array.from(
		{ length: 35 },
		(_, i) => `long technical phrase ${i} appears once`,
	).join('\n');
	const out = extractQueryCandidates(
		`${sourceLine}\n${sourceLine}\n${sourceLine}\n${englishNoise}`,
		{
			...BASE,
			focusedExtraction: false,
			normalProsePhrases: true,
			maxAutoQueries: 40,
		},
	);
	const protein = out.find((candidate) => candidate.query === 'プロテイン');
	assert.ok(protein, 'expected プロテイン to be kept as a one-word prose candidate');
	assert.equal(protein!.anchors.length, 3);
	assert.ok(protein!.score > 405, 'repeated prose terms receive a bounded ranking bonus');
});

test('prose repetition bonus never outranks headings', () => {
	const repeated = Array.from(
		{ length: 8 },
		() => 'ホエイプロテインとビタミンD3補給の筋への効果',
	).join('\n');
	const out = extractQueryCandidates(`## Important heading\n${repeated}`, {
		...BASE,
		normalProsePhrases: true,
		maxAutoQueries: 40,
	});
	const heading = out.findIndex((candidate) => candidate.query === 'Important heading');
	const protein = out.findIndex((candidate) => candidate.query === 'プロテイン');
	assert.ok(heading >= 0);
	assert.ok(protein >= 0);
	assert.ok(heading < protein);
});

test('existing markdown link text is not an anchor source', () => {
	const text = '[[linked term]] plain term';
	const out = extractQueryCandidates(text, { ...BASE, normalProsePhrases: true });
	for (const c of out) {
		for (const a of c.anchors) {
			const slice = text.slice(a.from, a.to);
			assert.ok(!slice.includes('[['));
		}
	}
});

test('dictionary terms become candidates inside an otherwise compound token', () => {
	const text = '高強度レジスタンストレーニングを継続する';
	const out = extractQueryCandidates(text, {
		...BASE,
		focusedExtraction: false,
		normalProsePhrases: false,
		manualDictionaryTerms: ['レジスタンス', 'トレーニング'],
	});
	for (const term of ['レジスタンス', 'トレーニング']) {
		const found = out.find((candidate) => candidate.query === term);
		assert.ok(found, term);
		assert.equal(found!.dictionaryOrigin, 'manual');
		assert.equal(text.slice(found!.anchors[0]!.from, found!.anchors[0]!.to), term);
	}
});

test('manual dictionary terms override stop words but ignored terms still win', () => {
	const text = 'the topic';
	const manual = extractQueryCandidates(text, {
		...BASE,
		focusedExtraction: false,
		normalProsePhrases: false,
		manualDictionaryTerms: ['the'],
	});
	assert.ok(manual.some((candidate) => candidate.query === 'the'));
	const ignored = extractQueryCandidates(text, {
		...BASE,
		focusedExtraction: false,
		normalProsePhrases: false,
		manualDictionaryTerms: ['the'],
		ignoredTerms: ['the'],
	});
	assert.ok(!ignored.some((candidate) => candidate.query === 'the'));
});

test('manual dictionary terms bypass the automatic minimum length', () => {
	const out = extractQueryCandidates('漸進とデロードを計画する', {
		...BASE,
		focusedExtraction: false,
		normalProsePhrases: false,
		manualDictionaryTerms: ['漸進'],
	});
	const found = out.find((candidate) => candidate.query === '漸進');
	assert.ok(found);
	assert.equal(found!.dictionaryOrigin, 'manual');
});

test('probe limit can be wider than the visible result baseline', () => {
	const text = Array.from({ length: 90 }, (_, i) => `word${i}`).join('\n');
	const out = extractQueryCandidates(text, {
		...BASE,
		focusedExtraction: false,
		normalProsePhrases: true,
		maxAutoQueries: 40,
		probeQueryLimit: 120,
		minTermLength: 4,
	});
	assert.ok(out.length > 40);
	assert.ok(out.length <= 120);
});
