// Detect consecutive headings with no body content between them. Pattern:
//   ## Section A
//
//   ### Subsection A.1
//
//   Content here.
//
// vs broken:
//   ## Section A
//
//   ### Subsection A.1
//   ### Subsection A.2
//
//   (only A.2 has body)
//
// Where the *first* heading has no body, we can sometimes collapse — but
// we don't auto-fix because the structure might be intentional. Info only.
export const flagOrphanHeadings = {
    id: "MD-AI070",
    name: "Flag orphan headings",
    category: "headings",
    severity: "low",
    description: "Identify headings with no body content (only another heading directly follows). Often signals over-structured documents.",
    run(text) {
        const lines = text.split("\n");
        let count = 0;
        let sample = "";
        for (let i = 0; i < lines.length - 1; i++) {
            const cur = lines[i];
            const isHeading = /^#{1,6}\s+\S/.test(cur);
            if (!isHeading)
                continue;
            // Skip blank lines, then check if next non-blank line is also a heading.
            let j = i + 1;
            while (j < lines.length && lines[j].trim() === "")
                j += 1;
            if (j >= lines.length)
                continue;
            if (/^#{1,6}\s+\S/.test(lines[j])) {
                count += 1;
                if (!sample)
                    sample = cur;
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
                    message: `Found ${count} heading(s) with no body content before the next heading.`,
                    detail: "Often a sign of redundant structure. Consider whether the empty parent heading is needed or whether children can be promoted.",
                    occurrences: count,
                    charsSaved: 0,
                    sampleBefore: sample.length > 60 ? sample.slice(0, 60) + "..." : sample,
                },
            ],
        };
    },
};
// Heading suffix redundancy: patterns like "### Section: " (with trailing colon)
// or "## Overview Overview" (repeated word). Rare but cheap to detect.
// Info only.
export const flagRedundantHeadingText = {
    id: "MD-AI071",
    name: "Flag redundant heading text",
    category: "headings",
    severity: "low",
    description: "Identify headings with trailing punctuation (colons, periods) or repeated identical text. These are usually accidental.",
    run(text) {
        const lines = text.split("\n");
        let count = 0;
        let sample = "";
        for (const line of lines) {
            const m = line.match(/^(#{1,6}\s+)(.+)$/);
            if (!m)
                continue;
            const headingText = m[2].trim();
            const trailingPunct = /[:.?!,]$/.test(headingText);
            const tokens = headingText.toLowerCase().split(/\s+/);
            const hasRepeat = tokens.length >= 2 && tokens[0] === tokens[1];
            if (trailingPunct || hasRepeat) {
                count += 1;
                if (!sample)
                    sample = line.length > 60 ? line.slice(0, 60) + "..." : line;
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
                    message: `Found ${count} heading(s) with trailing punctuation or repeated words.`,
                    occurrences: count,
                    charsSaved: 0,
                    sampleBefore: sample,
                },
            ],
        };
    },
};
