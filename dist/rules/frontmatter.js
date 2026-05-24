import { estimateTokensMid } from "../tokenizer.js";
// Detect YAML/TOML frontmatter and report its token weight. We never auto-strip
// frontmatter because it may be load-bearing (skill descriptions, build configs,
// SEO metadata). But we make its cost visible so the user can make an informed
// choice — and offer an "aggressive" variant that does strip it.
export const analyzeFrontmatter = {
    id: "MD-AI100",
    name: "Analyze frontmatter weight",
    category: "frontmatter",
    severity: "low",
    description: "Detect YAML (---) or TOML (+++) frontmatter and report its estimated token cost. Never auto-stripped.",
    run(text) {
        const yamlMatch = /^---\n([\s\S]*?)\n---\n?/.exec(text);
        const tomlMatch = /^\+\+\+\n([\s\S]*?)\n\+\+\+\n?/.exec(text);
        const match = yamlMatch ?? tomlMatch;
        if (!match)
            return { text, diagnostics: [] };
        const block = match[0];
        const tokens = estimateTokensMid(block);
        const kind = yamlMatch ? "YAML" : "TOML";
        return {
            text,
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `${kind} frontmatter detected (~${tokens} tokens, ${block.length} chars).`,
                    detail: "Kept by default. If this document is being sent to an LLM that doesn't need the metadata (e.g. you're attaching a published .md to a chat), enable the aggressive 'Strip frontmatter' rule below.",
                    occurrences: 1,
                    charsSaved: 0,
                    sampleBefore: block.split("\n").slice(0, 3).join("\n") + "...",
                },
            ],
        };
    },
};
// Aggressive variant: actually remove the frontmatter block.
export const stripFrontmatter = {
    id: "MD-AI101",
    name: "Strip frontmatter (aggressive)",
    category: "frontmatter",
    severity: "high",
    description: "Remove the YAML or TOML frontmatter block entirely. Off by default — only enable when the consumer doesn't need the metadata.",
    run(text, opts) {
        if (!opts.aggressive)
            return { text, diagnostics: [] };
        const yamlMatch = /^---\n([\s\S]*?)\n---\n?/.exec(text);
        const tomlMatch = /^\+\+\+\n([\s\S]*?)\n\+\+\+\n?/.exec(text);
        const match = yamlMatch ?? tomlMatch;
        if (!match)
            return { text, diagnostics: [] };
        const saved = match[0].length;
        return {
            text: text.slice(match[0].length),
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity: this.severity,
                    message: `Stripped frontmatter block (${saved} chars).`,
                    detail: "Aggressive: this removes potentially load-bearing metadata. Re-enable if your consumer needs it.",
                    occurrences: 1,
                    charsSaved: saved,
                },
            ],
        };
    },
};
