import { ALL_RULES } from "./rules/index.js";
import { Rule, RuleOptions, LintReport, Diagnostic } from "./types.js";
import { estimateTokens } from "./tokenizer.js";

// Rules that change document rendering and therefore stay off until the user
// explicitly opts into Aggressive mode. The UI ties these to the Aggressive
// toggle (auto-checks them when it goes on, greys them out when it goes off);
// the rules themselves still self-gate on opts.aggressive as defence-in-depth.
export const AGGRESSIVE_RULE_IDS = new Set(["MD-AI012", "MD-AI051", "MD-AI101"]);

export function defaultRuleOptions(): RuleOptions {
  const enabled: Record<string, boolean> = {};
  for (const r of ALL_RULES) {
    enabled[r.id] = !AGGRESSIVE_RULE_IDS.has(r.id);
  }
  return { enabled, aggressive: false };
}

export function lint(input: string, opts: RuleOptions): LintReport {
  const original = input;
  let text = input;
  const diagnostics: Diagnostic[] = [];

  for (const rule of ALL_RULES) {
    if (!opts.enabled[rule.id]) continue;
    try {
      const result = rule.run(text, opts);
      text = result.text;
      diagnostics.push(...result.diagnostics);
    } catch (err) {
      // Defensive: a buggy rule must not break the pipeline.
      // Surface as a diagnostic so the user sees what happened.
      diagnostics.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        severity: "low",
        message: `Rule failed: ${(err as Error).message}`,
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

export function allRules(): Rule[] {
  return ALL_RULES;
}
