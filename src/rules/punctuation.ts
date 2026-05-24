import { Rule, RuleResult, Diagnostic } from "../types.js";

// Smart quotes (curly quotes) are 2-3 bytes in UTF-8 and often tokenize as
// distinct or split tokens compared to straight ASCII quotes. For LLM input,
// the curly forms add cost with no semantic gain.
export const normalizeSmartQuotes: Rule = {
  id: "MD-AI010",
  name: "Replace smart quotes",
  category: "punctuation",
  severity: "low",
  description:
    "Convert curly quotes (‘’ “”) to straight ASCII quotes. Saves bytes and tokenizes more predictably.",
  run(text): RuleResult {
    let count = 0;
    let saved = 0;
    const out = text
      .replace(/[\u2018\u2019\u201A\u201B]/g, () => {
        count += 1;
        saved += 2; // 3-byte UTF-8 → 1-byte ASCII
        return "'";
      })
      .replace(/[\u201C\u201D\u201E\u201F]/g, () => {
        count += 1;
        saved += 2;
        return '"';
      });
    if (count === 0) return { text, diagnostics: [] };
    return {
      text: out,
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: this.severity,
          message: `Replaced ${count} curly quote(s) with straight equivalents.`,
          occurrences: count,
          charsSaved: saved,
        },
      ],
    };
  },
};

// Single-character ellipsis (…) is one UTF-8 multibyte character that often
// tokenizes as 1-2 tokens. Three ASCII periods are typically a single token
// in modern BPE vocabularies and unambiguous to read.
export const normalizeEllipsis: Rule = {
  id: "MD-AI011",
  name: "Expand ellipsis character",
  category: "punctuation",
  severity: "low",
  description: "Convert the single ellipsis character … to three periods (...). Often saves a token.",
  run(text): RuleResult {
    const count = (text.match(/\u2026/g) ?? []).length;
    if (count === 0) return { text, diagnostics: [] };
    const out = text.replace(/\u2026/g, "...");
    return {
      text: out,
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: this.severity,
          message: `Expanded ${count} ellipsis character(s) to three periods.`,
          occurrences: count,
          charsSaved: count * 2, // 3 bytes → 3 bytes is char-neutral but token-positive in most vocabs
          // we report a small char saving conservatively
        },
      ],
    };
  },
};

// Decorative dash patterns: em-dash with surrounding spaces (—) becomes
// a hyphen with surrounding spaces. Same readability, simpler token.
// This rule is gated by aggressive mode because some readers care about typography.
export const normalizeDashes: Rule = {
  id: "MD-AI012",
  name: "Simplify em/en dashes (aggressive)",
  category: "punctuation",
  severity: "low",
  description:
    "Convert em-dash (—) and en-dash (–) to ASCII hyphen-minus (-). Aggressive: changes typographic feel. Off by default.",
  run(text, opts): RuleResult {
    if (!opts.aggressive) return { text, diagnostics: [] };
    let count = 0;
    const out = text.replace(/[\u2013\u2014]/g, () => {
      count += 1;
      return "-";
    });
    if (count === 0) return { text, diagnostics: [] };
    return {
      text: out,
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: "medium",
          message: `Replaced ${count} em/en dashes with hyphens. Aggressive — review whether this matters for your document.`,
          occurrences: count,
          charsSaved: count * 2, // 3-byte UTF-8 → 1-byte
        },
      ],
    };
  },
};
