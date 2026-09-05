import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	normalizePopoverFocus,
	resolveAnchorAtPosition,
	resolveHoverSchedule,
	resolvePopoverActionTarget,
} from './popoverState.ts';
import {
	buildAutoSession,
	type NoteCandidate,
	type ResultGroup,
} from '../session.ts';

function candidate(path: string, headings: string[] = ['Heading']): NoteCandidate {
	return {
		path,
		stem: path,
		title: path,
		hits: headings.map((heading, offset) => ({
			path,
			heading,
			offset,
			excerpt: heading,
			mtime: 1,
		})),
	};
}

function group(key: string, candidates: NoteCandidate[]): ResultGroup {
	return {
		key,
		query: key,
		displayText: key,
		canLink: true,
		candidates,
	};
}

test('resets focus to first candidate when new group lacks old path', () => {
	const groupB = group('b', [candidate('b-first.md'), candidate('b-second.md')]);
	assert.deepEqual(
		normalizePopoverFocus(groupB, { path: 'a-selected.md', hitIndex: 2 }),
		{ path: 'b-first.md', hitIndex: 0 },
	);
});

test('clears focus when group has no candidates', () => {
	assert.deepEqual(
		normalizePopoverFocus(group('empty', []), {
			path: 'old.md',
			hitIndex: 1,
		}),
		{ path: '', hitIndex: 0 },
	);
});

test('resolves action target and hit from fresh anchor group', () => {
	const staleGroup = group('old', [candidate('stale.md')]);
	const freshGroup = group('fresh', [
		candidate('fresh.md', ['First', 'Fresh second']),
	]);
	const session = buildAutoSession({
		filePath: 'source.md',
		groups: [staleGroup, freshGroup],
		anchors: [
			{
				id: 'same-anchor-id',
				from: 0,
				to: 5,
				text: 'fresh',
				groupKey: 'fresh',
			},
		],
		style: 'invert',
		showBadge: true,
		caseSensitive: false,
	});

	const target = resolvePopoverActionTarget(
		session,
		'same-anchor-id',
		'fresh.md',
		1,
	);
	assert.equal(target?.group.key, 'fresh');
	assert.equal(target?.candidate.path, 'fresh.md');
	assert.equal(target?.hit.heading, 'Fresh second');
	assert.equal(
		resolvePopoverActionTarget(session, 'same-anchor-id', 'stale.md', 0),
		null,
	);
});

test('keeps a pending hover timer for repeated movement on the same anchor', () => {
	assert.equal(resolveHoverSchedule('anchor-a', null, false, 'anchor-a'), 'keep');
	assert.equal(resolveHoverSchedule('anchor-a', null, false, 'anchor-b'), 'schedule');
	assert.equal(resolveHoverSchedule('anchor-a', null, false, null), 'cancel');
	assert.equal(resolveHoverSchedule(null, 'anchor-a', true, 'anchor-a'), 'cancel');
});

test('resolves cursor boundaries and chooses the smallest containing anchor', () => {
	const anchors = [
		{ id: 'wide', from: 2, to: 12, text: 'wide', groupKey: 'wide' },
		{ id: 'small-b', from: 5, to: 8, text: 'small', groupKey: 'small' },
		{ id: 'small-a', from: 5, to: 8, text: 'small', groupKey: 'small' },
	];
	assert.equal(resolveAnchorAtPosition(anchors, 2)?.id, 'wide');
	assert.equal(resolveAnchorAtPosition(anchors, 8)?.id, 'small-a');
	assert.equal(resolveAnchorAtPosition(anchors, 12)?.id, 'wide');
	assert.equal(resolveAnchorAtPosition(anchors, 13), null);
});
