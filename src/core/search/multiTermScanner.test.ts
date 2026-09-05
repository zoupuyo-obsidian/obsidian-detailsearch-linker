import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanFileMultiTermsAsync } from './multiTermScanner.ts';

test('mixed case-sensitive and insensitive terms scan correctly', async () => {
	const content = 'Hello HELLO hello';
	const result = await scanFileMultiTermsAsync(
		{ path: 'n.md', content, mtime: 1 },
		[
			{ key: 'sensitive', query: 'Hello', caseSensitive: true },
			{ key: 'insensitive', query: 'hello', caseSensitive: false },
		],
		{ excerptLength: 40, maxHitsPerNote: 10 },
	);
	assert.equal(result.get('sensitive')!.length, 1);
	assert.equal(result.get('insensitive')!.length, 3);
});

test('case-sensitive term does not match different case when mixed batch', async () => {
	const content = 'hello only lower';
	const result = await scanFileMultiTermsAsync(
		{ path: 'n.md', content, mtime: 1 },
		[
			{ key: 'sensitive', query: 'Hello', caseSensitive: true },
			{ key: 'insensitive', query: 'hello', caseSensitive: false },
		],
		{ excerptLength: 40, maxHitsPerNote: 10 },
	);
	assert.equal(result.get('sensitive')!.length, 0);
	assert.equal(result.get('insensitive')!.length, 1);
});
