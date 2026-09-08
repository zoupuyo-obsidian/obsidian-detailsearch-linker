import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	shouldClearBodyCandidateSearch,
	shouldClearRepeatedClipboardSearch,
} from './unifiedSearch.ts';

test('body search only clears highlights belonging to the active note', () => {
	const session = { filePath: 'source.md', anchors: [{}] };
	assert.equal(shouldClearBodyCandidateSearch('source.md', session), true);
	assert.equal(shouldClearBodyCandidateSearch('other.md', session), false);
	assert.equal(shouldClearBodyCandidateSearch(undefined, session), false);
	assert.equal(shouldClearBodyCandidateSearch('source.md', { ...session, anchors: [] }), false);
});

test('repeated copied-text search clears its own one-term selection session', () => {
	assert.equal(
		shouldClearRepeatedClipboardSearch('term', 'source.md', {
			filePath: 'source.md',
			mode: 'selection',
			groups: [{ key: 'term' }],
			anchors: [{}],
		}),
		true,
	);
});

test('copied-text search does not clear a different or multi-term session', () => {
	assert.equal(
		shouldClearRepeatedClipboardSearch('term', 'source.md', {
			filePath: 'source.md',
			mode: 'selection',
			groups: [{ key: 'other' }],
			anchors: [{}],
		}),
		false,
	);
	assert.equal(
		shouldClearRepeatedClipboardSearch('term', 'source.md', {
			filePath: 'source.md',
			mode: 'auto',
			groups: [{ key: 'term' }],
			anchors: [{}],
		}),
		false,
	);
});
