import { findCodeFenceRanges } from "./comments.js";
// Detect duplicated or near-duplicated paragraphs within the same document.
// Inspired by SkillReducer's cross-file deduplication: within a single file
// authors often paste similar warnings, definitions, or "remember:" notes in
// multiple sections, and each repetition costs full tokens.
//
// Strategy:
//   - Split into paragraphs (separated by blank lines), skipping headings,
//     fenced code, tables, blockquotes.
//   - Normalize each paragraph (lowercase, collapse whitespace) and compare.
//   - When two paragraphs match exactly after normalization, flag the
//     duplicates (we don't auto-remove because the author may have intentional
//     repetition, e.g. across separately-loadable sections).
//   - Also detect near-duplicates using a cheap shingle-overlap metric.
//
// This rule is *info only* — we report and propose, never delete content
// silently. Removing duplicated text is too consequential to do without review.
function shingles(s, k = 4) {
    const out = new Set();
    const words = s.split(/\s+/).filter(Boolean);
    for (let i = 0; i <= words.length - k; i++) {
        out.add(words.slice(i, i + k).join(" "));
    }
    return out;
}
function jaccard(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let inter = 0;
    for (const x of a)
        if (b.has(x))
            inter += 1;
    return inter / (a.size + b.size - inter);
}
function normalize(s) {
    return s.replace(/\s+/g, " ").trim().toLowerCase();
}
export const detectParagraphDuplication = {
    id: "MD-AI090",
    name: "Detect duplicated paragraphs",
    category: "duplication",
    severity: "high",
    description: "Find paragraphs repeated verbatim or near-verbatim in different sections. Flagged for review — not auto-removed.",
    run(text) {
        const fenceRanges = findCodeFenceRanges(text);
        const lines = text.split("\n");
        const lineOffsets = [0];
        for (let i = 0; i < lines.length; i++) {
            lineOffsets.push(lineOffsets[i] + lines[i].length + 1);
        }
        const isInFence = (lineIdx) => fenceRanges.some((r) => lineOffsets[lineIdx] >= r.start && lineOffsets[lineIdx] < r.end);
        const paras = [];
        let buf = [];
        let bufStart = -1;
        const flush = () => {
            if (buf.length === 0)
                return;
            const joined = buf.join("\n");
            // Skip purely structural paragraphs.
            const isStructural = /^[ \t]*(?:#{1,6}\s|>|\d+\.\s|[-*+]\s|\||```|~~~|---|\*\*\*|___)/.test(joined);
            if (!isStructural && joined.trim().split(/\s+/).length >= 8) {
                paras.push({ text: joined, startLine: bufStart, lines: [...buf] });
            }
            buf = [];
            bufStart = -1;
        };
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === "" || isInFence(i)) {
                flush();
                continue;
            }
            if (bufStart === -1)
                bufStart = i;
            buf.push(line);
        }
        flush();
        if (paras.length < 2)
            return { text, diagnostics: [] };
        // Exact-match groups.
        const groups = new Map();
        for (const p of paras) {
            const key = normalize(p.text);
            const arr = groups.get(key) ?? [];
            arr.push(p);
            groups.set(key, arr);
        }
        const exactDuplicates = [...groups.values()].filter((g) => g.length >= 2);
        const nearMatches = [];
        const shingleCache = new Map();
        for (const p of paras)
            shingleCache.set(p, shingles(normalize(p.text)));
        for (let i = 0; i < paras.length; i++) {
            for (let j = i + 1; j < paras.length; j++) {
                const sa = shingleCache.get(paras[i]);
                const sb = shingleCache.get(paras[j]);
                if (sa.size === 0 || sb.size === 0)
                    continue;
                const sim = jaccard(sa, sb);
                // Threshold: ≥ 0.55 catches "the same warning rephrased lightly" without
                // flooding diagnostics with weakly-related paragraphs.
                if (sim >= 0.55 && sim < 1.0) {
                    nearMatches.push({ a: paras[i], b: paras[j], similarity: sim });
                }
            }
        }
        const diagnostics = [];
        if (exactDuplicates.length > 0) {
            const wastedChars = exactDuplicates.reduce((sum, g) => sum + (g.length - 1) * g[0].text.length, 0);
            const sample = exactDuplicates[0][0].text.length > 80
                ? exactDuplicates[0][0].text.slice(0, 80) + "..."
                : exactDuplicates[0][0].text;
            diagnostics.push({
                ruleId: this.id,
                ruleName: this.name,
                category: this.category,
                severity: "high",
                message: `Found ${exactDuplicates.length} paragraph(s) repeated verbatim (totalling ${wastedChars} repeated chars).`,
                detail: "Exact duplicates are usually safe to consolidate: keep one canonical copy and reference it from elsewhere. We don't auto-remove because the repetition may be intentional (e.g. content meant to be loaded independently).",
                occurrences: exactDuplicates.length,
                charsSaved: 0,
                sampleBefore: sample,
            });
        }
        if (nearMatches.length > 0) {
            // Keep at most the top 5 most similar for the diagnostics panel.
            nearMatches.sort((a, b) => b.similarity - a.similarity);
            const top = nearMatches.slice(0, 5);
            const sample = top[0].a.text.length > 80 ? top[0].a.text.slice(0, 80) + "..." : top[0].a.text;
            diagnostics.push({
                ruleId: this.id + "-near",
                ruleName: this.name + " (near match)",
                category: this.category,
                severity: "medium",
                message: `Found ${nearMatches.length} paragraph pair(s) with ≥55% shingle overlap.`,
                detail: `Top similarity: ${(top[0].similarity * 100).toFixed(0)}%. Consider merging redundant explanations.`,
                occurrences: nearMatches.length,
                charsSaved: 0,
                sampleBefore: sample,
            });
        }
        return { text, diagnostics };
    },
};
