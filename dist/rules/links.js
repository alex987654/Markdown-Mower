import { findCodeFenceRanges } from "./comments.js";
// Convert inline links to reference-style when the same URL appears multiple times.
//
// Inline: [text1](https://example.com/long-url) ... [text2](https://example.com/long-url)
// Cost: URL appears twice = 2N characters.
//
// Reference:
//   [text1][1] ... [text2][1]
//   ...
//   [1]: https://example.com/long-url
// Cost: URL appears once + a few chars of label indirection.
//
// The break-even is roughly when (URL_length × (uses - 1)) > (4 × uses + URL_length + label_overhead).
// In practice: any URL longer than ~15 chars used 2+ times wins.
export const convertRepeatedLinksToReferences = {
    id: "MD-AI060",
    name: "Reference-link conversion",
    category: "links",
    severity: "medium",
    description: "Convert inline links to reference style when the same URL appears more than once. Adds a definitions block at the end of the document.",
    run(text) {
        const fenceRanges = findCodeFenceRanges(text);
        const isInFence = (idx) => fenceRanges.some((r) => idx >= r.start && idx < r.end);
        // Find all inline links: [text](url) with no title.
        // We capture position so we can rewrite without disturbing fence content.
        const linkRe = /\[([^\[\]\n]+?)\]\((https?:\/\/[^\s)]+)\)/g;
        const occurrences = [];
        let m;
        while ((m = linkRe.exec(text)) !== null) {
            if (isInFence(m.index))
                continue;
            occurrences.push({
                match: m[0],
                index: m.index,
                text: m[1],
                url: m[2],
            });
        }
        if (occurrences.length === 0)
            return { text, diagnostics: [] };
        // Group by URL.
        const byUrl = new Map();
        for (const occ of occurrences) {
            const arr = byUrl.get(occ.url) ?? [];
            arr.push(occ);
            byUrl.set(occ.url, arr);
        }
        // Existing reference labels in the document — avoid collisions.
        const existingLabels = new Set();
        const refDefRe = /^\[([^\]\n]+)\]:\s+\S+/gm;
        let r;
        while ((r = refDefRe.exec(text)) !== null) {
            existingLabels.add(r[1].toLowerCase());
        }
        const conversions = [];
        let labelCounter = 1;
        for (const [url, occs] of byUrl) {
            if (occs.length < 2)
                continue;
            if (url.length < 15)
                continue;
            // Find a free numeric label.
            while (existingLabels.has(String(labelCounter)))
                labelCounter += 1;
            const label = String(labelCounter);
            existingLabels.add(label);
            labelCounter += 1;
            conversions.push({ url, label, occurrences: occs });
        }
        if (conversions.length === 0)
            return { text, diagnostics: [] };
        // Build new text by walking through occurrences sorted by index DESC
        // and splicing in the reference form.
        const allReplacements = conversions.flatMap((c) => c.occurrences.map((occ) => ({
            index: occ.index,
            length: occ.match.length,
            replacement: `[${occ.text}][${c.label}]`,
        })));
        allReplacements.sort((a, b) => b.index - a.index);
        let out = text;
        for (const rep of allReplacements) {
            out =
                out.slice(0, rep.index) +
                    rep.replacement +
                    out.slice(rep.index + rep.length);
        }
        // Append reference definitions. If text already ends with a newline, keep it.
        const trailing = out.endsWith("\n") ? "" : "\n";
        const defs = conversions
            .map((c) => `[${c.label}]: ${c.url}`)
            .join("\n");
        out += trailing + "\n" + defs + "\n";
        // Calculate savings: each conversion saves (url.length - label.length - 2)
        // per occurrence beyond the first, minus the cost of one definition line.
        let saved = 0;
        let occurrencesCount = 0;
        for (const c of conversions) {
            const perOcc = c.url.length - c.label.length - 2; // "[label]" vs "(url)"
            saved += perOcc * c.occurrences.length;
            saved -= `[${c.label}]: ${c.url}\n`.length;
            occurrencesCount += c.occurrences.length;
        }
        // Don't claim negative savings (the threshold heuristic should prevent this
        // but guard anyway).
        if (saved < 0)
            return { text, diagnostics: [] };
        return {
            text: out,
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Converted ${occurrencesCount} link(s) for ${conversions.length} repeated URL(s) to reference style.`,
                    detail: "Each URL appears once in a definitions block; inline links use a short numeric label. Break-even is around 15-char URLs used twice.",
                    occurrences: conversions.length,
                    charsSaved: Math.max(0, saved),
                    sampleBefore: conversions[0].occurrences[0].match,
                    sampleAfter: `[${conversions[0].occurrences[0].text}][${conversions[0].label}]`,
                },
            ],
        };
    },
};
// Strip tracking parameters from URLs. utm_*, fbclid, gclid, mc_cid, etc. all
// add bytes to URLs without affecting the destination an LLM cares about.
export const stripUrlTrackingParameters = {
    id: "MD-AI061",
    name: "Strip URL tracking parameters",
    category: "links",
    severity: "low",
    description: "Remove utm_*, fbclid, gclid, mc_cid, mc_eid, _hsenc, _hsmi, igshid, and similar tracking parameters from URLs.",
    run(text) {
        const fenceRanges = findCodeFenceRanges(text);
        const isInFence = (idx) => fenceRanges.some((r) => idx >= r.start && idx < r.end);
        const trackingParams = [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "utm_id",
            "fbclid",
            "gclid",
            "gbraid",
            "wbraid",
            "msclkid",
            "yclid",
            "dclid",
            "mc_cid",
            "mc_eid",
            "_hsenc",
            "_hsmi",
            "__hssc",
            "__hstc",
            "__hsfp",
            "igshid",
            "vero_id",
            "vero_conv",
            "ref_source",
            "ref_url",
            "_branch_match_id",
        ];
        const paramRe = new RegExp(`[?&](${trackingParams.join("|")})=[^&\\s)]*`, "g");
        // Find URLs in markdown link parens or bare http(s) tokens. We'll process
        // them with a wrapping regex.
        const urlRe = /(https?:\/\/[^\s)\]]+)/g;
        let saved = 0;
        let occurrences = 0;
        const out = text.replace(urlRe, (url, _u, offset) => {
            if (isInFence(offset))
                return url;
            const cleaned = url.replace(paramRe, "");
            // Tidy up: turn ?& or ?$ from leading-param removal into nothing.
            let tidied = cleaned
                .replace(/\?&/g, "?")
                .replace(/\?$/g, "")
                .replace(/&&+/g, "&")
                .replace(/&$/g, "");
            // If the removed param was first (?tracked=x&real=y), the "?" was
            // consumed with it — promote the first surviving "&" back to "?".
            if (url.includes("?") && !tidied.includes("?") && tidied.includes("&")) {
                tidied = tidied.replace("&", "?");
            }
            if (tidied.length < url.length) {
                saved += url.length - tidied.length;
                occurrences += 1;
                return tidied;
            }
            return url;
        });
        if (occurrences === 0)
            return { text, diagnostics: [] };
        return {
            text: out,
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Stripped tracking parameters from ${occurrences} URL(s).`,
                    occurrences,
                    charsSaved: saved,
                },
            ],
        };
    },
};
// Flag bare-URL footnotes — patterns like "See https://example.com/very/long/path"
// embedded inline, where the URL is part of prose. Linking the URL with shorter
// link text is usually denser. Info-only; we don't auto-rewrite because we
// don't know what link text the author intends.
export const flagBareLongUrls = {
    id: "MD-AI062",
    name: "Flag long bare URLs",
    category: "links",
    severity: "low",
    description: "Identify bare URLs longer than 50 characters that appear in prose. Consider wrapping them as [short text](url) or moving to references.",
    run(text) {
        const fenceRanges = findCodeFenceRanges(text);
        const isInFence = (idx) => fenceRanges.some((r) => idx >= r.start && idx < r.end);
        // Bare URL: http(s) not preceded by ]( or <
        const bareUrlRe = /(?:(?<![\(<]))(https?:\/\/[^\s)\]>]+)/g;
        let count = 0;
        let sample = "";
        let m;
        while ((m = bareUrlRe.exec(text)) !== null) {
            if (isInFence(m.index))
                continue;
            if (m[1].length >= 50) {
                count += 1;
                if (!sample)
                    sample = m[1];
            }
        }
        if (count === 0)
            return { text, diagnostics: [] };
        return {
            text,
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Found ${count} long bare URL(s) in prose.`,
                    detail: "These render as clickable links but the full URL is part of the document. Consider giving them link text or moving them to a references section.",
                    occurrences: count,
                    charsSaved: 0,
                    sampleBefore: sample.length > 60 ? sample.slice(0, 60) + "..." : sample,
                },
            ],
        };
    },
};
