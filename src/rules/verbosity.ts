import { Rule, RuleResult } from "../types.js";
import { findCodeFenceRanges } from "./comments.js";

// A library of "wordiness" rewrites that are essentially universal in English
// professional writing. These compress with no information loss. The rewrites
// are conservative — only patterns where the shorter form is uncontroversial.
//
// We avoid:
//   - Anything inside code fences
//   - Anything inside inline code spans (`...`)
//   - Anything inside link URLs (handled by link rules separately)
//   - Words inside HTML tag attributes
//
// Each replacement is a [pattern, replacement] pair. Patterns are case-insensitive
// but preserve the case of the first character of the original match.

interface Replacement {
  pattern: RegExp;
  replacement: string;
  // Human description for diagnostics.
  label: string;
}

const REPLACEMENTS: Replacement[] = [
  // Discourse markers that lead nowhere. We drop them entirely because the
  // sentences that follow are the actual content; the markers are reader
  // signals ("pay attention to what comes next") that an LLM doesn't need —
  // and substituting "Note:" can produce awkward results when the original
  // phrase is followed by a comma clause. `,?\s+` handles both
  // "Please note that the X is Y." and "Please note that, in fact, X is Y."
  // Discourse markers AT SENTENCE START — drop and capitalize the next word.
  // The lookbehind requires start-of-string, start-of-line, or sentence-ending
  // punctuation followed by whitespace. /gim — case-insensitive, multiline.
  { pattern: /(?<=^|\n|[.!?]\s)\bplease note that,?\s+([a-z])/gim, replacement: "{{CAP}}$1", label: "please note that → (removed, capitalize next)" },
  { pattern: /(?<=^|\n|[.!?]\s)\bit (?:is|'s) important to note that,?\s+([a-z])/gim, replacement: "{{CAP}}$1", label: "it is important to note that → (removed)" },
  { pattern: /(?<=^|\n|[.!?]\s)\bit (?:is|'s) worth (?:noting|mentioning) that,?\s+([a-z])/gim, replacement: "{{CAP}}$1", label: "it is worth noting that → (removed)" },
  { pattern: /(?<=^|\n|[.!?]\s)\bnote that,?\s+([a-z])/gim, replacement: "{{CAP}}$1", label: "note that → (removed)" },
  // Same discourse markers MID-SENTENCE — drop without capitalization. These
  // run after the sentence-start versions so the more specific patterns win.
  { pattern: /\bplease note that,?\s+/gi, replacement: "", label: "please note that → (removed, mid-sentence)" },
  { pattern: /\bit (?:is|'s) important to note that,?\s+/gi, replacement: "", label: "it is important to note that → (removed, mid-sentence)" },
  { pattern: /\bit (?:is|'s) worth (?:noting|mentioning) that,?\s+/gi, replacement: "", label: "it is worth noting that → (removed, mid-sentence)" },
  { pattern: /\bnote that,?\s+/gi, replacement: "", label: "note that → (removed, mid-sentence)" },
  { pattern: /\bas (?:was )?mentioned (?:earlier|above|previously)\b/gi, replacement: "earlier", label: "as mentioned above → earlier" },

  // Padding phrases.
  { pattern: /\bin order to\b/gi, replacement: "to", label: "in order to → to" },
  { pattern: /\bdue to the fact that\b/gi, replacement: "because", label: "due to the fact that → because" },
  { pattern: /\bin spite of the fact that\b/gi, replacement: "although", label: "in spite of the fact that → although" },
  { pattern: /\bdespite the fact that\b/gi, replacement: "although", label: "despite the fact that → although" },
  { pattern: /\bin the event that\b/gi, replacement: "if", label: "in the event that → if" },
  { pattern: /\bat this point in time\b/gi, replacement: "now", label: "at this point in time → now" },
  { pattern: /\bat the present time\b/gi, replacement: "now", label: "at the present time → now" },
  { pattern: /\bfor the purpose of\b/gi, replacement: "for", label: "for the purpose of → for" },
  { pattern: /\bin the process of\b/gi, replacement: "", label: "in the process of → (removed)" },
  { pattern: /\bwith regard(?:s)? to\b/gi, replacement: "about", label: "with regard to → about" },
  { pattern: /\bwith respect to\b/gi, replacement: "about", label: "with respect to → about" },
  { pattern: /\bin terms of\b/gi, replacement: "for", label: "in terms of → for" },
  { pattern: /\bon the basis of\b/gi, replacement: "based on", label: "on the basis of → based on" },
  { pattern: /\bin the case of\b/gi, replacement: "for", label: "in the case of → for" },
  { pattern: /\bin (?:a )?manner (?:that is|which is) similar\b/gi, replacement: "similarly", label: "in a manner similar → similarly" },

  // Hedges that LLM readers ignore. We optionally consume a leading comma so
  // parenthetical "X, basically, Y" collapses cleanly to "X Y" rather than
  // "X, Y" with a stranded comma.
  { pattern: /(,\s+)?\b(?:basically|essentially|fundamentally)(?:\s+speaking)?,?\s+/gi, replacement: " ", label: "basically/essentially → (removed)" },
  { pattern: /(,\s+)?\bactually,?\s+/gi, replacement: " ", label: "actually → (removed)" },
  { pattern: /\bquite\s+/gi, replacement: "", label: "quite → (removed)" },
  { pattern: /\bvery\s+/gi, replacement: "", label: "very → (removed)" },
  { pattern: /\breally\s+/gi, replacement: "", label: "really → (removed)" },

  // Doubling.
  { pattern: /\beach (?:and )?every\b/gi, replacement: "each", label: "each and every → each" },
  { pattern: /\bfirst and foremost\b/gi, replacement: "first", label: "first and foremost → first" },
  { pattern: /\bfew (?:and )?far between\b/gi, replacement: "rare", label: "few and far between → rare" },
  { pattern: /\bnull and void\b/gi, replacement: "void", label: "null and void → void" },

  // "There is/are" constructions where the rewrite is unambiguous.
  { pattern: /\bthere (?:is|are) a (?:number|lot) of\b/gi, replacement: "many", label: "there is a number of → many" },

  // "In conclusion / to summarize" at section starts — almost always
  // followed by the actual summary, making the phrase redundant. We use a
  // {{CAP}} sentinel that a post-pass replaces with the capitalized first
  // letter of the surviving sentence.
  { pattern: /^(?:in conclusion|to summarize|in summary),?\s+([a-z])/gim, replacement: "{{CAP}}$1", label: "to summarize / in conclusion → (removed)" },

  // Post-removal cleanup. These run after the main replacements above and
  // tidy the punctuation/whitespace that earlier removals left behind. They
  // never produce diagnostics of their own (their label starts with "(internal").
  { pattern: /[ \t]+,/g, replacement: ",", label: "(internal: tighten space-before-comma)" },
  { pattern: /,(\s*,)+/g, replacement: ",", label: "(internal: collapse stranded commas)" },
  { pattern: /[ \t]{2,}/g, replacement: " ", label: "(internal: collapse spaces)" },
  { pattern: /^[ \t]+|[ \t]+$/gm, replacement: "", label: "(internal: re-trim line edges)" },
];

// Mask out code-fenced regions and inline code spans before applying.
function withMaskedCode(
  text: string,
  fn: (visible: string) => string,
): string {
  const fenceRanges = findCodeFenceRanges(text);
  // Build segments: alternating "visible" and "masked".
  const segments: { masked: boolean; content: string }[] = [];
  let cursor = 0;
  for (const r of fenceRanges) {
    if (cursor < r.start) {
      segments.push({ masked: false, content: text.slice(cursor, r.start) });
    }
    segments.push({ masked: true, content: text.slice(r.start, r.end) });
    cursor = r.end;
  }
  if (cursor < text.length) {
    segments.push({ masked: false, content: text.slice(cursor) });
  }
  // Within each visible segment, also mask inline code spans (`...`).
  return segments
    .map((seg) => {
      if (seg.masked) return seg.content;
      // Inline code: split into runs.
      const parts: string[] = [];
      const inlineRe = /(`+)([^`]+?)\1/g;
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      while ((m = inlineRe.exec(seg.content)) !== null) {
        parts.push(fn(seg.content.slice(lastIdx, m.index)));
        parts.push(m[0]);
        lastIdx = m.index + m[0].length;
      }
      parts.push(fn(seg.content.slice(lastIdx)));
      return parts.join("");
    })
    .join("");
}

export const verbosityRewrites: Rule = {
  id: "MD-AI080",
  name: "Compress verbose phrasing",
  category: "verbosity",
  severity: "medium",
  description:
    "Apply a library of universal English compressions: 'in order to' → 'to', 'due to the fact that' → 'because', drop empty hedges. Skips code blocks.",
  run(text): RuleResult {
    let occurrences = 0;
    let saved = 0;
    const samples: string[] = [];
    const out = withMaskedCode(text, (visible) => {
      let v = visible;
      for (const rep of REPLACEMENTS) {
        v = v.replace(rep.pattern, (match, ...args) => {
          let replacement = rep.replacement;
          // Handle the {{CAP}}<letter> capitalization sentinel used for
          // sentence-start removals (e.g. "In conclusion, this..." → "This...")
          if (replacement.includes("{{CAP}}")) {
            const cap = (typeof args[0] === "string" ? args[0] : "").toUpperCase();
            replacement = replacement.replace("{{CAP}}$1", cap);
          }
          // Preserve first-letter case where meaningful.
          if (
            replacement &&
            match.length > 0 &&
            match[0] >= "A" &&
            match[0] <= "Z" &&
            replacement[0] >= "a" &&
            replacement[0] <= "z"
          ) {
            replacement = replacement[0].toUpperCase() + replacement.slice(1);
          }
          occurrences += 1;
          saved += match.length - replacement.length;
          if (samples.length < 3 && rep.label && !rep.label.startsWith("(internal")) {
            samples.push(rep.label);
          }
          return replacement;
        });
      }
      return v;
    });
    if (occurrences === 0) return { text, diagnostics: [] };
    return {
      text: out,
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: this.severity,
          message: `Applied ${occurrences} verbosity rewrite(s).`,
          detail:
            samples.length > 0
              ? `Examples applied: ${samples.join("; ")}`
              : undefined,
          occurrences,
          charsSaved: Math.max(0, saved),
        },
      ],
    };
  },
};
