// Count emoji density across the document. We don't remove inline emoji
// (they can carry semantic weight: ✅ = passed, ⚠️ = warning, etc.) but we
// report density so the user can decide whether to thin them. Decorative
// emoji-only lines are handled separately in rules/noise.ts.
export const reportEmojiDensity = {
    id: "MD-AI110",
    name: "Report emoji density",
    category: "emoji",
    severity: "low",
    description: "Count emoji per 1,000 characters. High density suggests decorative use that tokenizes expensively (2-4 tokens per emoji).",
    run(text) {
        // Permissive emoji match — includes most pictographic Unicode blocks.
        const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{2700}-\u{27BF}]/gu;
        const matches = text.match(re) ?? [];
        if (matches.length === 0)
            return { text, diagnostics: [] };
        const density = (matches.length / Math.max(1, text.length)) * 1000;
        // Threshold of concern: >3 emoji per 1k chars suggests decorative use.
        const severity = density > 5 ? "high" : density > 3 ? "medium" : "low";
        const message = density > 3
            ? `Found ${matches.length} emoji (${density.toFixed(1)} per 1k chars). High density — consider trimming decorative ones.`
            : `Found ${matches.length} emoji (${density.toFixed(1)} per 1k chars). Density is moderate.`;
        return {
            text,
            diagnostics: [
                {
                    ruleId: this.id,
                    ruleName: this.name,
                    category: this.category,
                    severity,
                    message,
                    detail: "Most emojis tokenize as 2-4 tokens each in English BPE vocabularies (more in tokenizers without a dedicated emoji vocab). Inline emoji carrying semantic meaning (✅ ⚠️ ❌) are usually worth keeping; emoji used as decoration usually aren't.",
                    occurrences: matches.length,
                    charsSaved: 0,
                },
            ],
        };
    },
};
