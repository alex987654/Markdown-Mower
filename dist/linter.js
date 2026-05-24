import { ALL_RULES } from "./rules/index.js";
import { estimateTokens } from "./tokenizer.js";
export function defaultRuleOptions() {
    const enabled = {};
    for (const r of ALL_RULES) {
        // Every rule starts enabled. The aggressive-only rules (MD-AI012, MD-AI051,
        // MD-AI101) self-gate on opts.aggressive inside their run() — so they're
        // safe to leave on; they simply do nothing until aggressive mode is set.
        enabled[r.id] = true;
    }
    return { enabled, aggressive: false };
}
export function lint(input, opts) {
    const original = input;
    let text = input;
    const diagnostics = [];
    for (const rule of ALL_RULES) {
        if (!opts.enabled[rule.id])
            continue;
        try {
            const result = rule.run(text, opts);
            text = result.text;
            diagnostics.push(...result.diagnostics);
        }
        catch (err) {
            // Defensive: a buggy rule must not break the pipeline.
            // Surface as a diagnostic so the user sees what happened.
            diagnostics.push({
                ruleId: rule.id,
                ruleName: rule.name,
                category: rule.category,
                severity: "low",
                message: `Rule failed: ${err.message}`,
                occurrences: 0,
                charsSaved: 0,
            });
        }
    }
    const before = estimateTokens(original);
    const after = estimateTokens(text);
    return {
        original,
        optimized: text,
        diagnostics,
        stats: {
            charsBefore: original.length,
            charsAfter: text.length,
            tokensBeforeLow: before.low,
            tokensBeforeHigh: before.high,
            tokensAfterLow: after.low,
            tokensAfterHigh: after.high,
        },
    };
}
export function allRules() {
    return ALL_RULES;
}
