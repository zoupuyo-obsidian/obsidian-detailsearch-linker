import type { BodyHit } from './types';

/** Limit results to at most `maxCandidateNotes` unique note paths (all hits per kept note). */
export function capHitsByNoteCount(hits: BodyHit[], maxCandidateNotes: number): BodyHit[] {
	if (maxCandidateNotes <= 0) {
		return [];
	}
	const byPath = new Map<string, BodyHit[]>();
	for (const hit of hits) {
		const list = byPath.get(hit.path) ?? [];
		list.push(hit);
		byPath.set(hit.path, list);
	}
	const out: BodyHit[] = [];
	for (const path of [...byPath.keys()].sort()) {
		const keptPaths = new Set(out.map((h) => h.path));
		if (keptPaths.size >= maxCandidateNotes && !keptPaths.has(path)) {
			break;
		}
		for (const hit of byPath.get(path) ?? []) {
			out.push(hit);
		}
	}
	return out;
}
