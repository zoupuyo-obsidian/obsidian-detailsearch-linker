import { covers, findProtectedSpans } from '../protectedSpans';

export interface Heading {
	level: number;
	text: string;
	offset: number;
}

const ATX_HEADING = /^( {0,3})(#{1,6})\s+(.+?)\s*#*\s*$/;

export function findHeadings(text: string): Heading[] {
	const protectedSpans = findProtectedSpans(text);
	const headings: Heading[] = [];
	const lines = text.split('\n');
	let offset = 0;
	for (const line of lines) {
		const m = ATX_HEADING.exec(line);
		if (m) {
			const lineEnd = offset + line.length;
			if (!covers(protectedSpans, offset, lineEnd)) {
				headings.push({
					level: m[2]!.length,
					text: m[3]!.trim(),
					offset,
				});
			}
		}
		offset += line.length + 1;
	}
	return headings;
}

export function nearestHeading(headings: Heading[], position: number): Heading | null {
	let best: Heading | null = null;
	for (const h of headings) {
		if (h.offset <= position) {
			best = h;
		} else {
			break;
		}
	}
	return best;
}

export function buildExcerpt(
	text: string,
	hitStart: number,
	hitEnd: number,
	maxLen: number,
): string {
	const radius = Math.max(20, Math.floor((maxLen - (hitEnd - hitStart)) / 2));
	let start = Math.max(0, hitStart - radius);
	let end = Math.min(text.length, hitEnd + radius);
	if (end - start > maxLen) {
		end = start + maxLen;
	}
	let excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
	if (start > 0) {
		excerpt = `…${excerpt}`;
	}
	if (end < text.length) {
		excerpt = `${excerpt}…`;
	}
	return excerpt;
}
