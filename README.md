# Markdown Mower

A browser-based, tokenizer agnostic Markdown trimmer that reduces the token cost of documents you send to LLMs. Runs entirely client-side; no server, no telemetry.

[**Live demo**](https://alex987654.github.io/Markdown-Mower/) 


## Rules

| ID | Category | Default | What it does |
|---|---|---|---|
| MD-AI001 | whitespace | on | Strip UTF-8 BOM |
| MD-AI002 | whitespace | on | CRLF / lone CR → LF |
| MD-AI003 | whitespace | on | Trim trailing whitespace (preserves GFM hard-break `  `) |
| MD-AI004 | whitespace | on | Collapse 3+ blank-line runs; trim document edges |
| MD-AI005 | whitespace | on | Normalize NBSP, zero-width chars, exotic spaces |
| MD-AI010 | punctuation | on | Curly quotes → straight ASCII |
| MD-AI011 | punctuation | on | Ellipsis character (…) → three periods |
| MD-AI012 | punctuation | **aggressive** | Em/en dashes → hyphens |
| MD-AI020 | noise | on | Strip decorative banner lines (═══, ▓▓▓, etc.) |
| MD-AI021 | noise | on | Collapse adjacent horizontal rules |
| MD-AI022 | noise | on | Remove empty headings |
| MD-AI023 | noise | on | Strip decorative emoji-only rows |
| MD-AI030 | comments | on | Remove `<!-- HTML comments -->` (keeps tool directives) |
| MD-AI040 | emphasis | on | Unwrap whole-paragraph `**bold**` / `*italic*` |
| MD-AI041 | emphasis | on | Flag `**Note:**`-style bold-label decorators (info) |
| MD-AI050 | tables | on | Strip padding spaces from table cells |
| MD-AI051 | tables | **aggressive** | Two-column tables → bullet lists |
| MD-AI052 | tables | on | Flag wide tables (≥5 columns) (info) |
| MD-AI060 | links | on | Convert repeated URLs to reference style |
| MD-AI061 | links | on | Strip URL tracking parameters (utm_*, fbclid, etc.) |
| MD-AI062 | links | on | Flag long bare URLs (info) |
| MD-AI070 | headings | on | Flag orphan headings (info) |
| MD-AI071 | headings | on | Flag redundant heading text (info) |
| MD-AI080 | verbosity | on | Universal English wordiness rewrites |
| MD-AI090 | duplication | on | Find duplicated and near-duplicate paragraphs (info) |
| MD-AI100 | frontmatter | on | Report frontmatter token weight (info) |
| MD-AI101 | frontmatter | **aggressive** | Strip frontmatter block |
| MD-AI110 | emoji | on | Report emoji density (info) |
