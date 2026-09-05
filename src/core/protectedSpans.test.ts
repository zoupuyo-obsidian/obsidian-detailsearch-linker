import assert from 'node:assert/strict';
import { test } from 'node:test';
import { covers, findProtectedSpans } from './protectedSpans.ts';

test('skips YAML frontmatter', () => {
	const text = '---\ntitle: x\n---\n本文救急';
	const spans = findProtectedSpans(text);
	assert.equal(covers(spans, 0, 10), true);
	const bodyAt = text.indexOf('救急');
	assert.equal(covers(spans, bodyAt, bodyAt + 2), false);
});

test('skips existing wikilinks', () => {
	const text = '前[[救急]]後';
	const spans = findProtectedSpans(text);
	const inner = text.indexOf('救急');
	assert.equal(covers(spans, inner, inner + 2), true);
});

test('skips inline code', () => {
	const text = 'code `救急` here';
	const spans = findProtectedSpans(text);
	const inner = text.indexOf('救急');
	assert.equal(covers(spans, inner, inner + 2), true);
});
