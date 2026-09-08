export type RibbonAction = 'unified-search' | 'clipboard-search';
export type RibbonId = 'unified-search' | 'clipboard-search';
export type RibbonI18nKey = 'ribbonTooltip' | 'cmdSearchClipboard';

export interface RibbonDefinition {
	id: RibbonId;
	icon: string;
	i18nKey: RibbonI18nKey;
	action: RibbonAction;
}

/**
 * Every plugin ribbon item is declared here so mobile actions cannot be
 * registered in one code path but omitted from another.
 */
export const RIBBON_DEFINITIONS: readonly RibbonDefinition[] = [
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
];
