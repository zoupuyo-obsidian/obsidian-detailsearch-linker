export interface Span {
	start: number;
	end: number;
}

export function mergeSpans(spans: Span[]): Span[] {
	if (spans.length === 0) {
		return [];
	}
	const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
	const out: Span[] = [];
	let cur = { ...sorted[0]! };
	for (let i = 1; i < sorted.length; i++) {
		const next = sorted[i]!;
		if (next.start <= cur.end) {
			cur.end = Math.max(cur.end, next.end);
		} else {
			out.push(cur);
			cur = { ...next };
		}
	}
	out.push(cur);
	return out;
}

export function covers(spans: Span[], start: number, end: number): boolean {
	for (const span of spans) {
		if (span.start >= end) {
			return false;
		}
		if (start < span.end && end > span.start) {
			return true;
		}
	}
	return false;
}

function push(spans: Span[], start: number, end: number): void {
	if (end > start) {
		spans.push({ start, end });
	}
}

export function findProtectedSpans(text: string): Span[] {
	const spans: Span[] = [];
	if (text.startsWith('---')) {
		const nl = text.indexOf('\n');
		if (nl !== -1) {
			const close = text.indexOf('\n---', nl + 1);
			if (close !== -1) {
				const end = close + 4;
				const after = text[end];
				push(spans, 0, after === '\n' || after === '\r' ? end + 1 : end);
			}
		}
	}

	const fence = /^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n {0,3}\2[ \t]*$/gm;
	let m: RegExpExecArray | null;
	while ((m = fence.exec(text)) !== null) {
		push(spans, m.index, m.index + m[0].length);
	}

	const inlineCode = /`+[^`\n]+`+/g;
	while ((m = inlineCode.exec(text)) !== null) {
		push(spans, m.index, m.index + m[0].length);
	}

	const displayMath = /\$\$[\s\S]*?\$\$/g;
	while ((m = displayMath.exec(text)) !== null) {
		push(spans, m.index, m.index + m[0].length);
	}

	const inlineMath = /(?<!\$)\$(?!\$)(?:\\.|[^$\n])+?\$(?!\$)/g;
	while ((m = inlineMath.exec(text)) !== null) {
		push(spans, m.index, m.index + m[0].length);
	}

	const wiki = /!?\[\[(?:[^[\]]|\[\[?)*?\]\]/g;
	while ((m = wiki.exec(text)) !== null) {
		push(spans, m.index, m.index + m[0].length);
	}

	const mdLink = /!?\[(?:[^\]\\]|\\.)*?\]\([^)]+\)/g;
	while ((m = mdLink.exec(text)) !== null) {
		push(spans, m.index, m.index + m[0].length);
	}

	const htmlComment = /<!--[\s\S]*?-->/g;
	while ((m = htmlComment.exec(text)) !== null) {
		push(spans, m.index, m.index + m[0].length);
	}

	const tag = /(?<![\\/#\w])#[^\s#][\w\-/]*/g;
	while ((m = tag.exec(text)) !== null) {
		const lineStart = text.lastIndexOf('\n', m.index) + 1;
		const before = text.slice(lineStart, m.index);
		if (/^\s{0,3}$/.test(before) && /^#{1,6}$/.test(m[0])) {
			continue;
		}
		if (/^\s{0,3}$/.test(before) && /^#{1,6}(?=\s|$)/.test(m[0])) {
			continue;
		}
		push(spans, m.index, m.index + m[0].length);
	}

	return mergeSpans(spans);
}
