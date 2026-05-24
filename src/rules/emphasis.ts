import { Rule, RuleResult } from "../types.js";
import { findCodeFenceRanges } from "./comments.js";

// Detect paragraphs that are entirely or near-entirely wrapped in bold or
// italic. The asterisks/underscores cost tokens; when they wrap a whole
// paragraph the emphasis is decorative (it produces visual weight, not a
// semantic distinction).
//
// We unwrap **the entire content** when:
//   - The paragraph is one logical line (no internal hard breaks)
//   - It is wrapped in matching ** ... ** with no interior bold
//   - Or wrapped in * ... * (italic) with no interior italic
//
// This is conservative: we don't touch partial emphasis or nested emphasis.
export const unwrapWholeParagraphEmphasis: Rule = {
  id: "MD-AI040",
  name: "Unwrap whole-paragraph emphasis",
  category: "emphasis",
  severity: "medium",
  description:
    "Remove ** or * that wraps an entire paragraph. Decorative weight that costs tokens without adding meaning. Inline emphasis is preserved.",
  run(text): RuleResult {
    const fenceRanges = findCodeFenceRanges(text);
    const isInFence = (idx: number) =>
      fenceRanges.some((r) => idx >= r.start && idx < r.end);

    // Split into paragraphs separated by blank lines, preserving the
    // separators so we can reassemble.
    const parts = text.split(/(\n\s*\n)/);
    let occurrences = 0;
    let saved = 0;
    let sample = "";
    let cursor = 0;
    const out: string[] = [];
    for (const part of parts) {
      const start = cursor;
      cursor += part.length;
      // Separators stay as-is.
      if (/^\n\s*\n$/.test(part)) {
        out.push(part);
        continue;
      }
      if (isInFence(start)) {
        out.push(part);
        continue;
      }
      // Don't touch list items, headings, blockquotes — only "plain paragraphs"
      // that aren't structurally meaningful.
      if (/^[ \t]*(?:#{1,6}\s|>|\d+\.\s|[-*+]\s|\||```|~~~)/.test(part)) {
        out.push(part);
        continue;
      }
      const trimmed = part.replace(/^\s+|\s+$/g, "");
      // Strong: wrapped in **...** with no other ** inside.
      const strongMatch = /^\*\*([\s\S]+?)\*\*$/.exec(trimmed);
      if (strongMatch && !strongMatch[1].includes("**")) {
        out.push(part.replace(trimmed, strongMatch[1]));
        occurrences += 1;
        saved += 4;
        if (!sample) sample = trimmed.slice(0, 60);
        continue;
      }
      // Italic: wrapped in *...* (single, not bold).
      const italicMatch = /^\*([\s\S]+?)\*$/.exec(trimmed);
      if (
        italicMatch &&
        !italicMatch[1].includes("*") &&
        !trimmed.startsWith("**")
      ) {
        out.push(part.replace(trimmed, italicMatch[1]));
        occurrences += 1;
        saved += 2;
        if (!sample) sample = trimmed.slice(0, 60);
        continue;
      }
      // Underscore-italic.
      const underscoreItalic = /^_([\s\S]+?)_$/.exec(trimmed);
      if (
        underscoreItalic &&
        !underscoreItalic[1].includes("_") &&
        !trimmed.startsWith("__")
      ) {
        out.push(part.replace(trimmed, underscoreItalic[1]));
        occurrences += 1;
        saved += 2;
        if (!sample) sample = trimmed.slice(0, 60);
        continue;
      }
      out.push(part);
    }
    if (occurrences === 0) return { text, diagnostics: [] };
    return {
      text: out.join(""),
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: this.severity,
          message: `Unwrapped emphasis from ${occurrences} whole paragraph(s).`,
          detail:
            "Whole-paragraph emphasis is decorative — the entire paragraph carries the same visual weight, so the marker conveys no information.",
          occurrences,
          charsSaved: saved,
          sampleBefore: sample
            ? sample.length > 50
              ? sample.slice(0, 50) + "..."
              : sample
            : undefined,
        },
      ],
    };
  },
};

// Detect runs of bold "labels" like **Important:** **Warning:** **Note:**
// at the start of paragraphs that are followed by prose. These are common
// but cost 4 tokens for the asterisks. We don't change the source, but flag
// it so the user can decide.
//
// Currently info-only (no edits). Severity low. Useful for the user to learn
// the pattern.
export const flagBoldLabels: Rule = {
  id: "MD-AI041",
  name: "Flag bold-label decorators",
  category: "emphasis",
  severity: "low",
  description:
    "Identify paragraphs that begin with a bold label like '**Note:**' or '**Warning:**'. Common pattern; flagged for visibility, not auto-fixed.",
  run(text): RuleResult {
    const re = /^\*\*[A-Z][A-Za-z ]{1,20}:\*\*/gm;
    const matches = text.match(re) ?? [];
    if (matches.length === 0) return { text, diagnostics: [] };
    return {
      text,
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: this.severity,
          message: `Found ${matches.length} bold-label decorator(s) like '**Note:**'.`,
          detail:
            "Each costs 4 tokens for the asterisks. Consider whether the label could be a heading, a one-word lead-in without bold, or simply omitted in AI-target docs.",
          occurrences: matches.length,
          charsSaved: 0,
          sampleBefore: matches[0],
        },
      ],
    };
  },
};
