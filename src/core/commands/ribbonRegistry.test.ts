import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RIBBON_DEFINITIONS } from './ribbonRegistry.ts';

test('registers the unified and clipboard ribbon actions', () => {
	assert.deepEqual(
		RIBBON_DEFINITIONS.map((definition) => ({
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
				id: 'clipboard-search',
				icon: 'clipboard',
				i18nKey: 'cmdSearchClipboard',
				action: 'clipboard-search',
			},
		],
	);
});
