export type RibbonAction = 'unified-search' | 'selection-search' | 'clipboard-search';
export type RibbonId = 'unified-search' | 'term-search';
export type RibbonI18nKey = 'ribbonTooltip' | 'cmdSearchSelection' | 'cmdSearchClipboard';

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
export function ribbonDefinitions(isMobile: boolean): readonly RibbonDefinition[] {
	return [
		{
			id: 'unified-search',
			icon: 'search',
			i18nKey: 'ribbonTooltip',
			action: 'unified-search',
		},
		isMobile
			? {
				id: 'term-search',
				icon: 'clipboard',
				i18nKey: 'cmdSearchClipboard',
				action: 'clipboard-search',
			}
			: {
				id: 'term-search',
				icon: 'text-select',
				i18nKey: 'cmdSearchSelection',
				action: 'selection-search',
			},
	];
}
