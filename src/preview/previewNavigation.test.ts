import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	beginPreviewNavigation,
	transitionPreviewNavigation,
} from './previewNavigation.ts';

const navigation = {
	sourcePath: 'source.md',
	targetPath: 'target.md',
};

test('target file-open preserves preview navigation', () => {
	assert.deepEqual(transitionPreviewNavigation(navigation, 'target.md'), {
		state: navigation,
		action: 'preserve',
	});
});

test('source file-open restores the source and ends preview navigation', () => {
	assert.deepEqual(transitionPreviewNavigation(navigation, 'source.md'), {
		state: null,
		action: 'restore-source',
	});
});

test('unrelated and null file-open clear and end preview navigation', () => {
	for (const path of ['third.md', null]) {
		assert.deepEqual(transitionPreviewNavigation(navigation, path), {
			state: null,
			action: 'clear',
		});
	}
});

test('preview navigation is not started for invalid or identical paths', () => {
	assert.equal(beginPreviewNavigation('', 'target.md'), null);
	assert.equal(beginPreviewNavigation('source.md', ''), null);
	assert.equal(beginPreviewNavigation('source.md', 'source.md'), null);
	assert.deepEqual(beginPreviewNavigation('source.md', 'target.md'), navigation);
});
