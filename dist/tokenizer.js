// Token estimation without knowing the specific tokenizer.
//
// We deliberately avoid pretending to count exact tokens. Different LLMs use
// different vocabularies (cl100k_base, o200k_base, Claude's tokenizer, SentencePiece,
// Llama BPE...) and any single estimator is wrong somewhere. Instead we produce a
// range so the UI can say "between X and Y tokens" — honest about uncertainty.
//
// The two bounds come from well-established rules of thumb that bracket most
// English-leaning BPE tokenizers:
//   - LOW bound  ≈ chars / 4.5  (efficient tokenizer, common English)
//   - HIGH bound ≈ chars / 3.2  (less efficient, code-heavy, unicode-heavy, or
//                                tokenizer with smaller vocab)
//
// Whitespace and punctuation tokenize differently across vocabularies, so we
// apply small corrections:
//   - Each newline costs roughly one token in most tokenizers; we add a per-line
//     correction so very-sparse vs very-dense text both estimate sensibly.
//   - Long runs of identical characters (banners, dashes) compress well in BPE,
//     so they bias the LOW bound downward.
//
// The point is *relative* counts: before vs after. The estimator only needs to
// be consistent, not exact, to make the savings claim meaningful.
export function estimateTokens(text) {
    if (!text)
        return { low: 0, high: 0 };
    const chars = text.length;
    const lines = text.split("\n").length;
    // Base character-ratio bounds.
    let low = chars / 4.5;
    let high = chars / 3.2;
    // Newline penalty — newlines are usually one token each, regardless of
    // surrounding text density, so they push both bounds up slightly when
    // the text is line-rich.
    const newlineAdjustment = lines * 0.15;
    low += newlineAdjustment;
    high += newlineAdjustment;
    // Long runs of repeated characters (banners like "=====" or "─────")
    // compress aggressively in BPE because the merged subword is a single token.
    // Detect them and don't over-count.
    const repeatedRunChars = (text.match(/([=\-_*~─━═#])\1{4,}/g) ?? [])
        .reduce((sum, run) => sum + run.length, 0);
    if (repeatedRunChars > 0) {
        low -= repeatedRunChars / 5; // assume ~1 token per 5 chars of the run
        high -= repeatedRunChars / 8;
    }
    // Non-ASCII content (emoji, CJK, mathematical symbols, MWL glyphs, etc.)
    // tokenizes less efficiently in most English-trained vocabularies. Each
    // non-ASCII character is often 2-3 tokens by itself.
    const nonAsciiCount = (text.match(/[^\x00-\x7F]/g) ?? []).length;
    if (nonAsciiCount > 0) {
        low += nonAsciiCount * 0.4;
        high += nonAsciiCount * 1.2;
    }
    // Clamp.
    low = Math.max(0, Math.round(low));
    high = Math.max(low, Math.round(high));
    return { low, high };
}
// Approximate single-number estimate. We never display this number on its own
// — it's the midpoint, used only for rules that need *some* numeric weight to
// compare passages against each other (e.g. flag the heaviest paragraphs).
export function estimateTokensMid(text) {
    const e = estimateTokens(text);
    return Math.round((e.low + e.high) / 2);
}
