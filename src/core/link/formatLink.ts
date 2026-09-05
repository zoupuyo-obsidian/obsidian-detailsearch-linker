export interface NoteLinkTarget {
	path: string;
	stem: string;
	title: string;
	heading: string;
}

export function formatHeadingWikilink(
	linktext: string,
	display: string,
	heading: string,
): string {
	const withHeading = heading ? `${linktext}#${heading}` : linktext;
	if (display === linktext || display === withHeading) {
		return `[[${withHeading}]]`;
	}
	return `[[${withHeading}|${display}]]`;
}

export function groupHitsByNote<T extends { path: string; heading: string; excerpt: string; offset: number }>(
	hits: T[],
): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const hit of hits) {
		const list = map.get(hit.path) ?? [];
		list.push(hit);
		map.set(hit.path, list);
	}
	return map;
}
