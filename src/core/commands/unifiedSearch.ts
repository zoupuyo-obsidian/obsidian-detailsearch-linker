export type UnifiedSearchBranch = 'selection' | 'auto';

export type RibbonAction = 'selection' | 'auto' | 'clear';

export interface ClipboardToggleSession {
	filePath: string;
	mode: 'selection' | 'auto';
	groups: readonly { key: string }[];
	anchors: readonly unknown[];
}

export function hasNonEmptySelection(selectionText: string): boolean {
	return selectionText.trim().length > 0;
}

/** Unified command: non-empty trimmed selection → selection search, else auto extract. */
export function resolveUnifiedCommandBranch(selectionText: string): UnifiedSearchBranch {
	return hasNonEmptySelection(selectionText) ? 'selection' : 'auto';
}

/**
 * Ribbon: selection → search (even if highlights exist); no selection + highlights → clear;
 * no selection + no highlights → auto extract.
 */
export function resolveRibbonAction(
	selectionText: string,
	hasActiveSession: boolean,
): RibbonAction {
	if (hasNonEmptySelection(selectionText)) {
		return 'selection';
	}
	if (hasActiveSession) {
		return 'clear';
	}
	return 'auto';
}

/**
 * A repeated copied-text search is a toggle, matching the on-demand
 * highlighting behavior used by the companion linker plugin.  Limit the
 * toggle to the one-group selection session created by this command: a
 * copied term that happens to occur in an auto-search remains a new explicit
 * search rather than unexpectedly clearing unrelated groups.
 */
export function shouldClearRepeatedClipboardSearch(
	queryKey: string,
	filePath: string,
	session: ClipboardToggleSession,
): boolean {
	return (
		session.filePath === filePath &&
		session.mode === 'selection' &&
		session.anchors.length > 0 &&
		session.groups.length === 1 &&
		session.groups[0]?.key === queryKey
	);
}
