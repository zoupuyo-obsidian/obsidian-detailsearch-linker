import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findHeadings, nearestHeading } from './search/headingResolver.ts';

test('finds ATX headings outside code', () => {
	const text = '# Title\n\n## Section\n\n```\n# fake\n```\n\n### Real';
	const headings = findHeadings(text);
	assert.equal(headings.length, 3);
	assert.equal(headings[0]!.text, 'Title');
	assert.equal(headings[1]!.text, 'Section');
	assert.equal(headings[2]!.text, 'Real');
});

test('nearestHeading picks preceding heading', () => {
	const text = '# A\n\nbody\n\n## B\n\nmatch here';
	const headings = findHeadings(text);
	const pos = text.indexOf('match');
	const h = nearestHeading(headings, pos);
	assert.equal(h?.text, 'B');
});

test('no heading returns empty nearest', () => {
	const text = 'plain text only';
	const headings = findHeadings(text);
	assert.equal(nearestHeading(headings, 5), null);
});
