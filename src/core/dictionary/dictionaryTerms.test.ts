import assert from 'node:assert/strict';
import test from 'node:test';
import {
	isLearnableDictionaryTerm,
	learnDictionaryTerm,
	MAX_LEARNED_DICTIONARY_TERMS,
	normalizeDictionaryTerms,
} from './dictionaryTerms.ts';

test('learned dictionary rejects URL, path, identifier, and number-only values', () => {
	const input = {
		minLength: 3,
		maxLength: 32,
		stopWords: ['the'],
		ignoredTerms: ['skip'],
		caseSensitive: false,
	};
	assert.equal(isLearnableDictionaryTerm('レジスタンス', input), true);
	for (const term of ['https://example.com', '20_Notes/file.md', 'some_value', '12345', 'the', 'skip']) {
		assert.equal(isLearnableDictionaryTerm(term, input), false, term);
	}
});

test('manual terms win and learned terms are maintained as an LRU', () => {
	assert.deepEqual(learnDictionaryTerm(['protein'], ['Protein'], 'protein'), ['protein']);
	assert.deepEqual(learnDictionaryTerm(['alpha', 'beta'], [], 'alpha'), ['beta', 'alpha']);
	const many = Array.from({ length: MAX_LEARNED_DICTIONARY_TERMS }, (_, i) => `term${i}`);
	const next = learnDictionaryTerm(many, [], 'newterm');
	assert.equal(next.length, MAX_LEARNED_DICTIONARY_TERMS);
	assert.equal(next[0], 'term1');
	assert.equal(next.at(-1), 'newterm');
});

test('editable dictionary entries are trimmed, validated, and deduplicated', () => {
	assert.deepEqual(normalizeDictionaryTerms([' Alpha ', '', 'alpha', 'bad\nterm']), ['Alpha']);
});
