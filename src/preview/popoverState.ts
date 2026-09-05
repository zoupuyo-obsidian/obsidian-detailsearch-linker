import type {
	DetailSessionState,
	NoteCandidate,
	ResultGroup,
	SessionAnchor,
} from '../session';
import type { BodyHit } from '../core/search/types';
import { getGroup } from '../session';

export interface PopoverFocus {
	path: string;
	hitIndex: number;
}

export interface PopoverActionTarget {
	anchor: SessionAnchor;
	group: ResultGroup;
	candidate: NoteCandidate;
	hit: BodyHit;
	hitIndex: number;
}

export function normalizePopoverFocus(
	group: ResultGroup,
	focus: PopoverFocus,
): PopoverFocus {
	const candidate = group.candidates.find((item) => item.path === focus.path);
	if (!candidate) {
		return group.candidates[0]
			? { path: group.candidates[0].path, hitIndex: 0 }
			: { path: '', hitIndex: 0 };
	}
	if (candidate.hits.length === 0) {
		return { path: candidate.path, hitIndex: 0 };
	}
	return {
		path: candidate.path,
		hitIndex:
			focus.hitIndex >= 0 && focus.hitIndex < candidate.hits.length
				? focus.hitIndex
				: 0,
	};
}

export function resolvePopoverActionTarget(
	session: DetailSessionState,
	anchorId: string,
	candidatePath: string,
	hitIndex: number,
): PopoverActionTarget | null {
	const anchor = session.anchors.find((item) => item.id === anchorId);
	if (!anchor) {
		return null;
	}
	const group = getGroup(session, anchor.groupKey);
	const candidate = group?.candidates.find((item) => item.path === candidatePath);
	if (!group || !candidate) {
		return null;
	}
	const resolvedHitIndex =
		hitIndex >= 0 && hitIndex < candidate.hits.length ? hitIndex : 0;
	const hit = candidate.hits[resolvedHitIndex];
	if (!hit) {
		return null;
	}
	return { anchor, group, candidate, hit, hitIndex: resolvedHitIndex };
}
