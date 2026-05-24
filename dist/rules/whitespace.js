// Strip UTF-8 BOM if present. BOM characters are almost always tokenized as a
// distinct token and serve no purpose in Markdown intended for an AI consumer.
export const removeBom = {
    id: "MD-AI001",
    name: "Strip UTF-8 BOM",
    category: "whitespace",
    severity: "low",
    description: "Remove leading byte-order mark (U+FEFF). Editors sometimes add it; tokenizers always count it.",
    run(text) {
        if (!text.startsWith("\uFEFF")) {
            return { text, diagnostics: [] };
        }
        const out = text.slice(1);
        const d = {
            ruleId: this.id,
            ruleName: this.name,
            category: this.category,
            severity: this.severity,
            message: "Stripped one UTF-8 BOM from the start of the document.",
            occurrences: 1,
            charsSaved: 1,
        };
        return { text: out, diagnostics: [d] };
    },
};
// Normalize CRLF -> LF. Two-character line endings double the newline cost in
// some pipelines and have zero benefit when the consumer is an LLM.
export const normalizeLineEndings = {
    id: "MD-AI002",
    name: "Normalize line endings",
    category: "whitespace",
    severity: "low",
    description: "Convert CRLF (\\r\\n) and lone CR (\\r) to LF (\\n). One byte per line ending instead of two.",
    run(text) {
        const crlfCount = (text.match(/\r\n/g) ?? []).length;
        const loneCrCount = (text.match(/\r(?!\n)/g) ?? []).length;
        const total = crlfCount + loneCrCount;
        if (total === 0)
            return { text, diagnostics: [] };
        const out = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        return {
            text: out,
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Converted ${crlfCount} CRLF and ${loneCrCount} lone CR sequences to LF.`,
                    occurrences: total,
                    charsSaved: crlfCount, // CRLF→LF removes one \r per occurrence
                },
            ],
        };
    },
};
// Trim trailing whitespace on every line. This pays for itself instantly: every
// trailing space is a counted character that produces no rendered output.
export const trimTrailingWhitespace = {
    id: "MD-AI003",
    name: "Trim trailing whitespace",
    category: "whitespace",
    severity: "low",
    description: "Remove trailing spaces and tabs at the end of lines. Two trailing spaces force a hard line break in some flavors — preserved when intentional.",
    run(text) {
        // GFM "two trailing spaces = <br>" is a corner case. If a line ends with
        // exactly two spaces and the next line is non-empty, preserve them.
        const lines = text.split("\n");
        let saved = 0;
        let occurrences = 0;
        const out = lines.map((line, i) => {
            const m = line.match(/[ \t]+$/);
            if (!m)
                return line;
            const trailing = m[0];
            const next = lines[i + 1];
            const isHardBreak = trailing === "  " && next !== undefined && next.trim() !== "";
            if (isHardBreak)
                return line;
            saved += trailing.length;
            occurrences += 1;
            return line.replace(/[ \t]+$/, "");
        });
        if (saved === 0)
            return { text, diagnostics: [] };
        return {
            text: out.join("\n"),
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Trimmed trailing whitespace from ${occurrences} line(s); preserved intentional <br> markers.`,
                    occurrences,
                    charsSaved: saved,
                },
            ],
        };
    },
};
// Collapse runs of 3+ blank lines to a single pair. Vertical rhythm in source
// is rarely meaningful to an LLM and each empty line costs at least one token.
export const collapseBlankLines = {
    id: "MD-AI004",
    name: "Collapse blank-line runs",
    category: "whitespace",
    severity: "low",
    description: "Collapse runs of three or more blank lines into a single blank line. Preserves single and double blank lines, which carry structural meaning.",
    run(text) {
        let occurrences = 0;
        let saved = 0;
        // First, collapse runs of 3+ blank lines.
        const after = text.replace(/\n{3,}/g, (match) => {
            occurrences += 1;
            saved += match.length - 2;
            return "\n\n";
        });
        // Then trim leading and trailing whitespace from the whole document,
        // adding back exactly one trailing newline for POSIX-tidiness.
        const trimmed = after.replace(/^\s+|\s+$/g, "");
        const out = trimmed.length > 0 ? trimmed + "\n" : "";
        const trimDelta = after.length - out.length;
        if (trimDelta > 0) {
            occurrences += 1;
            saved += trimDelta;
        }
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
                    message: `Collapsed ${occurrences} run(s) of excessive blank lines (including document edges).`,
                    occurrences,
                    charsSaved: saved,
                },
            ],
        };
    },
};
// Replace non-breaking spaces and other invisible whitespace with regular spaces.
// Non-breaking space (U+00A0) often tokenizes differently from regular space and
// is rarely intentional in Markdown.
export const normalizeInvisibleSpaces = {
    id: "MD-AI005",
    name: "Normalize invisible whitespace",
    category: "whitespace",
    severity: "low",
    description: "Convert non-breaking spaces, zero-width characters, and exotic whitespace to plain spaces or remove them entirely.",
    run(text) {
        let occurrences = 0;
        let saved = 0;
        // Zero-width chars: remove outright.
        const zwCount = (text.match(/[\u200B\u200C\u200D\u2060\uFEFF]/g) ?? [])
            .length;
        let out = text.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
        occurrences += zwCount;
        saved += zwCount;
        // Non-breaking and exotic spaces → regular space (no char savings, but tokenizer benefit).
        const exoticSpaceMatches = (text.match(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g) ?? []).length;
        out = out.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
        occurrences += exoticSpaceMatches;
        if (occurrences === 0)
            return { text, diagnostics: [] };
        return {
            text: out,
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: "medium",
                    message: `Normalized ${occurrences} invisible/exotic whitespace character(s). Most tokenize as their own token.`,
                    occurrences,
                    charsSaved: saved,
                },
            ],
        };
    },
};
