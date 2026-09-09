import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ribbonDefinitions } from './ribbonRegistry.ts';

test('desktop registers body and selected-text ribbon actions', () => {
	assert.deepEqual(
		ribbonDefinitions(false).map((definition) => ({
			id: definition.id,
			icon: definition.icon,
			i18nKey: definition.i18nKey,
			action: definition.action,
		})),
		[
			{
				id: 'unified-search',
				icon: 'search',
				i18nKey: 'ribbonTooltip',
				action: 'unified-search',
			},
			{
				id: 'term-search',
				icon: 'text-select',
				i18nKey: 'cmdSearchSelection',
				action: 'selection-search',
			},
		],
	);
});

test('mobile registers body and copied-text ribbon actions', () => {
	assert.deepEqual(ribbonDefinitions(true)[1], {
		id: 'term-search',
		icon: 'clipboard',
		i18nKey: 'cmdSearchClipboard',
		action: 'clipboard-search',
	});
});
