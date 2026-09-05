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
