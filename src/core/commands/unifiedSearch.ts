export interface ClipboardToggleSession {
	filePath: string;
	mode: 'selection' | 'auto';
	groups: readonly { key: string }[];
	anchors: readonly unknown[];
}

/** Body-candidate search ignores selection; visible results on this note toggle off. */
export function shouldClearBodyCandidateSearch(
	filePath: string | undefined,
	session: Pick<ClipboardToggleSession, 'filePath' | 'anchors'>,
): boolean {
	return !!filePath && session.filePath === filePath && session.anchors.length > 0;
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
