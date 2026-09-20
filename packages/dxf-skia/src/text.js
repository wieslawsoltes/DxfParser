/* Font-independent text arrangement. A host may inject native metrics without
 * coupling the tagged document or geometry compiler to a graphics runtime. */
(function (root) {
    'use strict';
    const A = root.DxfSkia;
    function fallbackTextWidth(text) { return Array.from(text).reduce((n, c) => n + (A.draftingGlyph?.(c)?.advance ?? .7), 0); }
    function layoutText(primitive, measure = fallbackTextWidth, { maxCharacters = 100000, maxLines = 4096 } = {}) {
        const source = String(primitive.text || '');
        if (source.length > maxCharacters)
            throw new RangeError('Text character budget exceeded.');
        const wrap = primitive.mtext && primitive.wrapWidth > 0 ? primitive.wrapWidth : Infinity;
        const lines = [];
        const append = text => { if (lines.length >= maxLines)
            throw new RangeError('Text line budget exceeded.'); const width = measure(text); if (!Number.isFinite(width) || width < 0)
            throw new RangeError('Invalid text measurement.'); lines.push({ text, width }); };
        for (const paragraph of source.split('\n')) {
            if (!Number.isFinite(wrap) || measure(paragraph) <= wrap) {
                append(paragraph);
                continue;
            }
            let line = '', width = 0;
            for (const token of paragraph.match(/\S+|\s+/gu) || []) {
                const w = measure(token);
                if (line && width + w > wrap) {
                    append(line.trimEnd());
                    line = '';
                    width = 0;
                }
                if (!line && /^\s+$/u.test(token))
                    continue;
                if (w <= wrap) {
                    line += token;
                    width += w;
                    continue;
                }
                for (const ch of token) {
                    const cw = measure(ch);
                    if (line && width + cw > wrap) {
                        append(line);
                        line = '';
                        width = 0;
                    }
                    line += ch;
                    width += cw;
                }
            }
            if (line || !lines.length)
                append(line.trimEnd());
        }
        if (!lines.length)
            append('');
        const spacing = Math.max(.25, Math.min(4, primitive.lineSpacing || 1)) * 1.25, descent = .2;
        const height = (lines.length - 1) * spacing + 1 + descent;
        const naturalWidth = Math.max(0, ...lines.map(l => l.width));
        const alignmentWidth = Number.isFinite(wrap) ? wrap : naturalWidth;
        let baseline = 0;
        if (primitive.mtext)
            baseline = primitive.vertical === 1 ? 1 - height / 2 : primitive.vertical === 2 ? 1 - height : 1;
        else
            baseline = primitive.vertical === 3 ? 1 : primitive.vertical === 2 ? (1 - descent) / 2 : primitive.vertical === 1 ? -descent : 0;
        for (let i = 0; i < lines.length; i++)
            Object.assign(lines[i], { x: -(primitive.align || 0) * alignmentWidth / 2, y: baseline + i * spacing });
        const left = lines[0].x, right = left + Math.max(naturalWidth, .01), top = baseline - 1, bottom = baseline + (lines.length - 1) * spacing + descent;
        return { lines, left, top, right, bottom, width: right - left, height: bottom - top, spacing };
    }
    Object.assign(A, { layoutText, fallbackTextWidth });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);
