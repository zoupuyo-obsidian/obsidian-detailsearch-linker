export interface HighlightSegment {
	text: string;
	highlighted: boolean;
}

/**
 * Split excerpt text into plain/highlighted segments for a query.
 * Uses index-based matching on parallel case-folded strings (same constraint as body search:
 * `toLowerCase()` length matches original for matched spans).
 */
export function splitHighlightedText(
	excerpt: string,
	query: string,
	caseSensitive: boolean,
): HighlightSegment[] {
	if (!excerpt) {
		return [];
	}
	const trimmed = query.trim();
	if (!trimmed) {
		return [{ text: excerpt, highlighted: false }];
	}

	const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
	const haystack = caseSensitive ? excerpt : excerpt.toLowerCase();
	if (!needle || haystack.length < needle.length) {
		return [{ text: excerpt, highlighted: false }];
	}

	const segments: HighlightSegment[] = [];
	let pos = 0;
	while (pos <= haystack.length - needle.length) {
		const idx = haystack.indexOf(needle, pos);
		if (idx === -1) {
			break;
		}
		if (idx > pos) {
			segments.push({ text: excerpt.slice(pos, idx), highlighted: false });
		}
		const end = idx + trimmed.length;
		segments.push({ text: excerpt.slice(idx, end), highlighted: true });
		pos = end;
	}
	if (pos < excerpt.length) {
		segments.push({ text: excerpt.slice(pos), highlighted: false });
	}
	if (segments.length === 0) {
		return [{ text: excerpt, highlighted: false }];
	}
	return segments;
}

export function fillHighlightedExcerpt(
	container: HTMLElement,
	excerpt: string,
	query: string,
	caseSensitive: boolean,
	style: string,
): void {
	container.replaceChildren();
	container.addClass('detailsearch-linker-popover__excerpt');
	for (const segment of splitHighlightedText(excerpt, query, caseSensitive)) {
		if (segment.highlighted) {
			const span = container.createSpan({
				cls: `detailsearch-linker-popover__term is-${style}`,
			});
			span.textContent = segment.text;
		} else if (segment.text) {
			container.appendText(segment.text);
		}
	}
}
