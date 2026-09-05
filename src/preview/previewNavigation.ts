export interface PreviewNavigationState {
	sourcePath: string;
	targetPath: string;
}

export type PreviewNavigationAction = 'preserve' | 'restore-source' | 'clear';

export interface PreviewNavigationTransition {
	state: PreviewNavigationState | null;
	action: PreviewNavigationAction;
}

export function beginPreviewNavigation(
	sourcePath: string,
	targetPath: string,
): PreviewNavigationState | null {
	if (!sourcePath || !targetPath || sourcePath === targetPath) {
		return null;
	}
	return { sourcePath, targetPath };
}

export type PreviewOpenStrategy =
	| { kind: 'existing'; leafIndex: number }
	| { kind: 'new-tab' };

/**
 * Open the target in its existing leaf or a new tab. Never reuse the source
 * editor — replacing that document remaps source anchors onto the target.
 */
export function resolvePreviewOpenStrategy(
	leaves: readonly { path: string }[],
	targetPath: string,
): PreviewOpenStrategy {
	const leafIndex = leaves.findIndex((leaf) => leaf.path === targetPath);
	return leafIndex >= 0 ? { kind: 'existing', leafIndex } : { kind: 'new-tab' };
}

export function transitionPreviewNavigation(
	state: PreviewNavigationState,
	openedPath: string | null,
): PreviewNavigationTransition {
	if (openedPath === state.targetPath) {
		return { state, action: 'preserve' };
	}
	if (openedPath === state.sourcePath) {
		return { state: null, action: 'restore-source' };
	}
	return { state: null, action: 'clear' };
}
