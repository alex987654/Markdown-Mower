// Decorative banner lines: rows like "════════", "########", "✨✨✨✨"
// at the start or end of sections. These are pure visual ornament. An LLM
// ignores their shape and pays for every character.
//
// We only strip lines that are *entirely* decorative — not legitimate
// horizontal rules (--- or *** by themselves), which are separately handled
// by the excessive-HR rule. A banner here means a long line of one repeated
// non-alphanumeric character (not a legal MD construct).
export const stripDecorativeBanners = {
    id: "MD-AI020",
    name: "Strip decorative banner lines",
    category: "noise",
    severity: "medium",
    description: "Remove lines that consist solely of repeated decorative characters (═══, ───, ▓▓▓, ✦✦✦) used as visual ornaments, not as Markdown horizontal rules.",
    run(text) {
        const lines = text.split("\n");
        let occurrences = 0;
        let saved = 0;
        let sampleBefore = "";
        const out = [];
        for (const line of lines) {
            const stripped = line.trim();
            // Detect ornament lines: 5+ repeats of a non-MD-significant character,
            // and not a legal CommonMark thematic break (---, ***, ___ alone).
            const isOrnament = stripped.length >= 5 &&
                /^([═━─▓░▒▀▄■□●○◆◇★☆✦✧❖✱✲✺❀❉❋])\1+$/.test(stripped);
            if (isOrnament) {
                occurrences += 1;
                saved += line.length + 1; // +1 for the newline we're also removing
                if (!sampleBefore)
                    sampleBefore = line.slice(0, 40);
                continue;
            }
            out.push(line);
        }
        if (occurrences === 0)
            return { text, diagnostics: [] };
        return {
            text: out.join("\n"),
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Removed ${occurrences} decorative banner line(s).`,
                    detail: "These lines are visual ornaments that contribute no information to an LLM consumer. They tokenize as their full length.",
                    occurrences,
                    charsSaved: saved,
                    sampleBefore,
                    sampleAfter: "",
                },
            ],
        };
    },
};
// Excessive horizontal rules. CommonMark allows ---, ***, ___ as thematic
// breaks. A few are fine; many in a row, or several within a short span,
// often indicate decorative use. We collapse runs of consecutive HRs and
// warn about very dense HR use.
export const collapseHorizontalRules = {
    id: "MD-AI021",
    name: "Collapse adjacent horizontal rules",
    category: "noise",
    severity: "low",
    description: "Collapse two or more horizontal rules separated only by blank lines into a single rule.",
    run(text) {
        // A horizontal rule is a line containing only ---, ***, or ___ (3+ chars).
        // "Adjacent" HRs are HRs that are separated only by blank lines (with no
        // other content between). We walk line-by-line and drop a second HR if
        // the last non-blank line we saw was also an HR.
        const lines = text.split("\n");
        const out = [];
        let lastNonBlankWasHr = false;
        let occurrences = 0;
        let saved = 0;
        let sample = "";
        let pendingBlanks = [];
        for (const line of lines) {
            const isBlank = line.trim() === "";
            const isHr = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/.test(line);
            if (isBlank) {
                pendingBlanks.push(line);
                continue;
            }
            if (isHr && lastNonBlankWasHr) {
                occurrences += 1;
                saved += line.length + 1 + pendingBlanks.reduce((s, b) => s + b.length + 1, 0);
                if (!sample)
                    sample = line;
                // Drop both the HR and the blank lines that led up to it.
                pendingBlanks = [];
                continue;
            }
            // Flush pending blanks, then the line.
            for (const b of pendingBlanks)
                out.push(b);
            pendingBlanks = [];
            out.push(line);
            lastNonBlankWasHr = isHr;
        }
        // Flush trailing blanks.
        for (const b of pendingBlanks)
            out.push(b);
        if (occurrences === 0)
            return { text, diagnostics: [] };
        return {
            text: out.join("\n"),
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Collapsed ${occurrences} adjacent horizontal rule(s) into one.`,
                    occurrences,
                    charsSaved: saved,
                    sampleBefore: sample,
                },
            ],
        };
    },
};
// Empty headers: lines like "## " or "###" with nothing after. They generate
// no rendered content but tokenize as the hashes plus any trailing whitespace.
export const removeEmptyHeaders = {
    id: "MD-AI022",
    name: "Remove empty headings",
    category: "noise",
    severity: "medium",
    description: "Drop heading lines that have no text content (e.g. '##' or '### ' on its own).",
    run(text) {
        const lines = text.split("\n");
        let occurrences = 0;
        let saved = 0;
        let sample = "";
        const out = lines.filter((line) => {
            if (/^#{1,6}[ \t]*$/.test(line)) {
                occurrences += 1;
                saved += line.length + 1;
                if (!sample)
                    sample = line;
                return false;
            }
            return true;
        });
        if (occurrences === 0)
            return { text, diagnostics: [] };
        return {
            text: out.join("\n"),
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Removed ${occurrences} empty heading line(s).`,
                    occurrences,
                    charsSaved: saved,
                    sampleBefore: sample || undefined,
                },
            ],
        };
    },
};
// Decorative emoji clusters — three or more emojis in a row, either on their
// own line or as a "section opener". These are common in human-targeted docs
// (🚀✨ Welcome ✨🚀) but tokenize expensively per the SkillReducer "less is
// more" finding: they distract attention without conveying information.
//
// Default: NOT aggressive. We only strip clusters that are alone on a line
// (clearly decorative), never emoji embedded in prose.
export const stripDecorativeEmojiRows = {
    id: "MD-AI023",
    name: "Strip decorative emoji rows",
    category: "noise",
    severity: "medium",
    description: "Remove lines that consist solely of three or more emoji (with optional spacing). Inline emoji in prose are kept.",
    run(text) {
        // Match lines that are pure emoji + whitespace. We use a permissive emoji
        // class that covers common Unicode emoji blocks; not perfect, good enough.
        const emojiClass = "[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{1F000}-\\u{1F02F}\\u{1F0A0}-\\u{1F0FF}\\u{2700}-\\u{27BF}\\u{FE0F}\\u{200D}]";
        const re = new RegExp(`^[\\s]*(?:${emojiClass}[\\s]*){3,}$`, "u");
        const lines = text.split("\n");
        let occurrences = 0;
        let saved = 0;
        let sample = "";
        const out = [];
        for (const line of lines) {
            if (re.test(line)) {
                occurrences += 1;
                saved += line.length + 1;
                if (!sample)
                    sample = line.slice(0, 60);
                continue;
            }
            out.push(line);
        }
        if (occurrences === 0)
            return { text, diagnostics: [] };
        return {
            text: out.join("\n"),
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Removed ${occurrences} decorative emoji-only line(s).`,
                    detail: "Each emoji typically tokenizes as 2-4 tokens. A line of pure emoji adds attention noise without information for an LLM reader.",
                    occurrences,
                    charsSaved: saved,
                    sampleBefore: sample || undefined,
                },
            ],
        };
    },
};
