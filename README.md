# Markdown Mower

A tokenizer-agnostic Markdown trimmer for documents destined for an LLM. It cuts token cost by removing what AI models don't need — padding, decoration, boilerplate — while explaining every change it makes.

[**Live demo**](https://alex987654.github.io/Markdown-Mower/) — runs entirely in your browser; no server, no telemetry.

## What it does

Paste Markdown (or upload a file, fetch a URL, or convert a PDF) and Markdown Mower runs 29 rules over it, producing a trimmed copy plus a diagnostics panel ("Marginalia") explaining each change. Rules cover:

- **Whitespace & encoding** — BOM, CRLF, trailing spaces, blank-line runs, zero-width and exotic spaces
- **Comments** — strips `<!-- HTML comments -->` (tooling directives like `prettier-ignore` are preserved)
- **Noise** — decorative banners, empty headings, emoji rows, redundant horizontal rules
- **Emphasis** — unwraps whole-paragraph bold/italic, flags bold-label decorators
- **Tables** — strips cell padding; flags wide tables
- **Links** — strips tracking parameters (`utm_*`, `fbclid`, …), converts repeated URLs to reference style
- **Verbosity** — universal English compressions ("in order to" → "to", "due to the fact that" → "because"); hedge-word deletion (very, really, quite, actually) is a separate rule gated behind Aggressive mode since it can shift meaning
- **Duplication** — flags verbatim and near-duplicate paragraphs (info only, never auto-removed)

Every rule can be toggled individually. Four rules that change rendered output or meaning (table → list conversion, dash normalization, frontmatter stripping, hedge-word deletion) are off by default and gated behind **Aggressive mode**. Code fences and inline code are never touched.

## Why "tokenizer-agnostic"?

Tokenizer counts change with every model release and don't agree across vendors. Rather than pretend one number is *the* token cost, the tool reports a **range** built from two rules of thumb (≈ chars/4.5 to chars/3.2, corrected for newlines, repeated-character runs, and non-ASCII) and targets patterns that cost more in *every* tokenizer. The estimator only needs to be consistent — before vs. after — for the savings claim to be meaningful.

Inspired in part by SkillReducer (arXiv:2603.29919) and the broader "less is more" finding that trimming non-essential content tends to improve agent quality, not just reduce cost.

## Development

No runtime dependencies — plain TypeScript compiled to ES modules, served statically.
`dist/` included for GitHub Pages.

```sh
npm install        # installs TypeScript (the only dev dependency)
npm run build      # tsc → dist/
npm run smoke      # runs smoke-test.mjs against dist/
```

Layout:

- `src/rules/` — one file per rule category; rules are merely `text in → text + diagnostics out`
- `src/linter.ts` — pipeline: runs rules in registry order ([src/rules/index.ts](src/rules/index.ts))
- `src/tokenizer.ts` — the range-based token estimator
- `src/app.ts` — UI wiring (no framework)

PDF conversion uses [`@opendocsg/pdf2md`](https://github.com/opendocsg/pdf2md), loaded on demand in the browser.

## License

MIT
