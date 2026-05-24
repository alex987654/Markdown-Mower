import { Rule, RuleResult } from "../types.js";

// HTML comments <!-- ... --> are invisible in rendered Markdown but every byte
// counts against the LLM's context window. This includes multi-line comments
// (common in MkDocs/Hugo source for editorial notes).
//
// Two exceptions we preserve:
//   1. Documentation-instruction comments like <!-- prettier-ignore --> or
//      <!-- markdownlint-disable --> that control tooling. We detect a small
//      allow-list of these.
//   2. Comments inside fenced code blocks (they're literal content, not real
//      HTML comments).
export const removeHtmlComments = {
  id: "MD-AI030",
  name: "Remove HTML comments",
  category: "comments" as const,
  severity: "medium" as const,
  description:
    "Remove <!-- comments --> from the document. Invisible to readers but counted by tokenizers. Tooling-control comments are preserved.",
  run(text: string): RuleResult {
    // First, mark code fence regions so we don't touch them.
    const fenceRanges = findCodeFenceRanges(text);
    const isInFence = (idx: number) =>
      fenceRanges.some((r) => idx >= r.start && idx < r.end);

    const allowList = [
      "prettier-ignore",
      "markdownlint-disable",
      "markdownlint-enable",
      "markdownlint-restore",
      "markdownlint-capture",
      "vale-disable",
      "vale-enable",
    ];

    let occurrences = 0;
    let saved = 0;
    let sample = "";

    // We do a manual scan because we want to preserve allow-listed comments.
    let out = "";
    let i = 0;
    while (i < text.length) {
      if (
        text[i] === "<" &&
        text.slice(i, i + 4) === "<!--" &&
        !isInFence(i)
      ) {
        const end = text.indexOf("-->", i + 4);
        if (end === -1) {
          // Unclosed comment — leave alone.
          out += text.slice(i);
          break;
        }
        const inner = text.slice(i + 4, end).trim();
        const isToolingDirective = allowList.some((tag) =>
          inner.startsWith(tag),
        );
        if (isToolingDirective) {
          out += text.slice(i, end + 3);
          i = end + 3;
          continue;
        }
        const consumed = end + 3 - i;
        occurrences += 1;
        saved += consumed;
        if (!sample) sample = text.slice(i, Math.min(i + 60, end + 3));
        i = end + 3;
        // Also swallow a single immediately-following newline so we don't leave a blank line.
        if (text[i] === "\n") i += 1;
        continue;
      }
      out += text[i];
      i += 1;
    }

    if (occurrences === 0) return { text, diagnostics: [] };
    return {
      text: out,
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: this.severity,
          message: `Removed ${occurrences} HTML comment block(s).`,
          detail:
            "Tooling directives (prettier-ignore, markdownlint-*, vale-*) are preserved.",
          occurrences,
          charsSaved: saved,
          sampleBefore: sample || undefined,
        },
      ],
    };
  },
};

// Helper: return [start, end) ranges that lie within a fenced code block.
// Both ``` and ~~~ fences are recognized. Used by multiple rules.
export function findCodeFenceRanges(
  text: string,
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const fenceRe = /^([ \t]*)(```+|~~~+)([^\n]*)$/gm;
  let m: RegExpExecArray | null;
  let openFence: { start: number; marker: string; indent: string } | null =
    null;
  while ((m = fenceRe.exec(text)) !== null) {
    const indent = m[1];
    const marker = m[2];
    if (openFence === null) {
      openFence = { start: m.index, marker: marker[0], indent };
    } else if (marker[0] === openFence.marker && marker.length >= 3) {
      // Closing fence (same kind, same or longer).
      ranges.push({ start: openFence.start, end: m.index + m[0].length });
      openFence = null;
    }
  }
  if (openFence !== null) {
    ranges.push({ start: openFence.start, end: text.length });
  }
  return ranges;
}
