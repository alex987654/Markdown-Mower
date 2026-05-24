// Shared types for the trimmer pipeline.
//
// A "rule" inspects markdown text and produces (a) a transformed version of
// that text and (b) a list of diagnostics explaining what changed and why.
// Rules run in a defined sequence; later rules see the output of earlier ones.

export type Severity = "low" | "medium" | "high";

export type RuleCategory =
  | "whitespace"
  | "punctuation"
  | "noise"
  | "emphasis"
  | "headings"
  | "tables"
  | "links"
  | "emoji"
  | "verbosity"
  | "duplication"
  | "frontmatter"
  | "comments";

export interface Diagnostic {
  ruleId: string;       // e.g. "MD-AI004"
  ruleName: string;     // human-friendly short name
  category: RuleCategory;
  severity: Severity;
  message: string;      // single-sentence explanation
  detail?: string;      // optional longer reasoning
  occurrences: number;  // how many times this rule fired
  // Optional sample for the diagnostics panel — kept short for UI use.
  sampleBefore?: string;
  sampleAfter?: string;
  // Estimated savings, in characters (we keep tokens out of rules and
  // compute them centrally so we have one consistent heuristic).
  charsSaved: number;
}

export interface RuleResult {
  text: string;
  diagnostics: Diagnostic[];
}

export interface Rule {
  id: string;
  name: string;
  category: RuleCategory;
  severity: Severity;
  description: string;     // shown in the toggle list
  // Run on the full document. Most rules are pure functions of text in/out.
  run(text: string, opts: RuleOptions): RuleResult;
}

export interface RuleOptions {
  // The user can disable individual rules.
  enabled: Record<string, boolean>;
  // Aggressiveness — currently used by a few rules (e.g. verbosity)
  // to decide whether borderline rewrites apply.
  aggressive: boolean;
}

export interface LintReport {
  original: string;
  optimized: string;
  diagnostics: Diagnostic[];
  stats: {
    charsBefore: number;
    charsAfter: number;
    tokensBeforeLow: number;
    tokensBeforeHigh: number;
    tokensAfterLow: number;
    tokensAfterHigh: number;
  };
}
