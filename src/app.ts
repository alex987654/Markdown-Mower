import { lint, allRules, defaultRuleOptions, AGGRESSIVE_RULE_IDS } from "./linter.js";
import { Rule, RuleOptions, LintReport, Diagnostic, Severity } from "./types.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  input: "",
  options: defaultRuleOptions(),
  report: null as LintReport | null,
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector(sel) as T | null;
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

const create = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    if (k === "class") el.className = v as string;
    else if (k.startsWith("data-")) el.setAttribute(k, v as string);
    else (el as any)[k] = v;
  }
  for (const c of children) {
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function rerun() {
  if (!state.input) {
    renderEmpty();
    return;
  }
  state.report = lint(state.input, state.options);
  renderReport(state.report);
}

function renderEmpty() {
  $("#stats").innerHTML = "";
  $("#diagnostics").innerHTML = "";
  $<HTMLTextAreaElement>("#output").value = "";
  setOutputMeta(0, { low: 0, high: 0 });
}

function setOutputMeta(chars: number, tokens: { low: number; high: number }) {
  $("#output-meta").textContent = `${chars.toLocaleString()} chars · ~${tokens.low.toLocaleString()}–${tokens.high.toLocaleString()} tokens`;
}

function renderReport(report: LintReport) {
  // Output text.
  const out = $<HTMLTextAreaElement>("#output");
  out.value = report.optimized;

  // Input meta (chars + tokens).
  $("#input-meta").textContent =
    `${report.stats.charsBefore.toLocaleString()} chars · ~${report.stats.tokensBeforeLow.toLocaleString()}–${report.stats.tokensBeforeHigh.toLocaleString()} tokens`;
  setOutputMeta(report.stats.charsAfter, {
    low: report.stats.tokensAfterLow,
    high: report.stats.tokensAfterHigh,
  });

  // Stats banner.
  const charsSaved = report.stats.charsBefore - report.stats.charsAfter;
  const charsSavedPct =
    report.stats.charsBefore > 0
      ? (charsSaved / report.stats.charsBefore) * 100
      : 0;
  const tokensSavedLow = report.stats.tokensBeforeLow - report.stats.tokensAfterLow;
  const tokensSavedHigh = report.stats.tokensBeforeHigh - report.stats.tokensAfterHigh;
  const tokensMidSavedPct =
    report.stats.tokensBeforeHigh > 0
      ? (((report.stats.tokensBeforeLow + report.stats.tokensBeforeHigh) / 2 -
          (report.stats.tokensAfterLow + report.stats.tokensAfterHigh) / 2) /
          ((report.stats.tokensBeforeLow + report.stats.tokensBeforeHigh) / 2)) *
        100
      : 0;

  const stats = $("#stats");
  stats.innerHTML = "";
  stats.appendChild(
    create(
      "div",
      { class: "stat" },
      create("div", { class: "stat-num" }, `${charsSaved.toLocaleString()}`),
      create("div", { class: "stat-label" }, `chars trimmed (${charsSavedPct.toFixed(1)}%)`),
    ),
  );
  stats.appendChild(
    create(
      "div",
      { class: "stat" },
      create(
        "div",
        { class: "stat-num" },
        `~${tokensSavedLow.toLocaleString()}–${tokensSavedHigh.toLocaleString()}`,
      ),
      create("div", { class: "stat-label" }, `tokens trimmed (${tokensMidSavedPct.toFixed(1)}% midpoint)`),
    ),
  );
  stats.appendChild(
    create(
      "div",
      { class: "stat" },
      create(
        "div",
        { class: "stat-num" },
        `${report.diagnostics.length}`,
      ),
      create("div", { class: "stat-label" }, "diagnostics raised"),
    ),
  );

  // Diagnostics list.
  renderDiagnostics(report.diagnostics);
}

function renderDiagnostics(diagnostics: Diagnostic[]) {
  const container = $("#diagnostics");
  container.innerHTML = "";

  if (diagnostics.length === 0) {
    container.appendChild(
      create(
        "div",
        { class: "diag-empty" },
        "No diagnostics. Either the document was already lean, or every enabled rule found nothing to say.",
      ),
    );
    return;
  }

  // Group by category.
  const byCat = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const arr = byCat.get(d.category) ?? [];
    arr.push(d);
    byCat.set(d.category, arr);
  }

  const order = [
    "frontmatter",
    "whitespace",
    "comments",
    "punctuation",
    "noise",
    "emphasis",
    "headings",
    "tables",
    "links",
    "verbosity",
    "duplication",
    "emoji",
  ];

  for (const cat of order) {
    const items = byCat.get(cat);
    if (!items || items.length === 0) continue;
    const totalSaved = items.reduce((s, i) => s + i.charsSaved, 0);
    const totalOcc = items.reduce((s, i) => s + i.occurrences, 0);

    const section = create("section", { class: "diag-group" });
    section.appendChild(
      create(
        "header",
        { class: "diag-group-header" },
        create("span", { class: "diag-cat" }, cat),
        create(
          "span",
          { class: "diag-cat-meta" },
          totalSaved > 0
            ? `${totalSaved.toLocaleString()} chars · ${totalOcc} hit${totalOcc === 1 ? "" : "s"}`
            : `${totalOcc} note${totalOcc === 1 ? "" : "s"}`,
        ),
      ),
    );
    for (const d of items) {
      section.appendChild(renderOneDiagnostic(d));
    }
    container.appendChild(section);
  }
}

function renderOneDiagnostic(d: Diagnostic): HTMLElement {
  const sev = sevToClass(d.severity);
  const card = create("article", { class: `diag-card ${sev}` });
  card.appendChild(
    create(
      "header",
      { class: "diag-card-header" },
      create("span", { class: "diag-id" }, d.ruleId),
      create("span", { class: "diag-name" }, d.ruleName),
      d.charsSaved > 0
        ? create(
            "span",
            { class: "diag-saved" },
            `−${d.charsSaved.toLocaleString()} chars`,
          )
        : create("span", { class: "diag-saved diag-info" }, "info"),
    ),
  );
  card.appendChild(create("p", { class: "diag-msg" }, d.message));
  if (d.detail) {
    card.appendChild(create("p", { class: "diag-detail" }, d.detail));
  }
  if (d.sampleBefore) {
    const sampleEl = create("div", { class: "diag-sample" });
    sampleEl.appendChild(
      create("code", { class: "sample-before" }, d.sampleBefore),
    );
    if (d.sampleAfter !== undefined) {
      sampleEl.appendChild(create("span", { class: "sample-arrow" }, "→"));
      sampleEl.appendChild(
        create("code", { class: "sample-after" }, d.sampleAfter || "(removed)"),
      );
    }
    card.appendChild(sampleEl);
  }
  return card;
}

function sevToClass(s: Severity): string {
  switch (s) {
    case "high":
      return "sev-high";
    case "medium":
      return "sev-medium";
    case "low":
      return "sev-low";
  }
}

// ---------------------------------------------------------------------------
// Rule toggles
// ---------------------------------------------------------------------------

function renderRuleToggles() {
  const container = $("#rules-list");
  container.innerHTML = "";

  // Group by category.
  const rules = allRules();
  const byCat = new Map<string, Rule[]>();
  for (const r of rules) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(r);
    byCat.set(r.category, arr);
  }
  const order = [
    "frontmatter",
    "whitespace",
    "comments",
    "punctuation",
    "noise",
    "emphasis",
    "headings",
    "tables",
    "links",
    "verbosity",
    "duplication",
    "emoji",
  ];

  for (const cat of order) {
    const items = byCat.get(cat);
    if (!items) continue;
    const section = create("section", { class: "rule-group" });
    section.appendChild(
      create("header", { class: "rule-group-header" }, cat),
    );
    for (const r of items) {
      const isAggressive = AGGRESSIVE_RULE_IDS.has(r.id);
      const locked = isAggressive && !state.options.aggressive;
      const row = create("label", {
        class: locked ? "rule-row rule-row--locked" : "rule-row",
      });
      const cb = create("input", { type: "checkbox" }) as HTMLInputElement;
      cb.checked = state.options.enabled[r.id];
      cb.disabled = locked;
      cb.addEventListener("change", () => {
        state.options.enabled[r.id] = cb.checked;
        rerun();
      });
      row.appendChild(cb);
      const label = create("div", { class: "rule-label" });
      label.appendChild(create("div", { class: "rule-id" }, r.id));
      label.appendChild(create("div", { class: "rule-name" }, r.name));
      label.appendChild(create("div", { class: "rule-desc" }, r.description));
      row.appendChild(label);
      section.appendChild(row);
    }
    container.appendChild(section);
  }
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

function setInput(text: string) {
  state.input = text;
  $<HTMLTextAreaElement>("#input").value = text;
  rerun();
}

async function convertPdfToMarkdown(file: File): Promise<string> {
  const statusEl = $("#url-status");
  statusEl.textContent = `Converting ${file.name}...`;
  statusEl.className = "url-status loading";
  try {
    // @ts-ignore — runtime ESM import; no local types for the CDN module.
    const mod = await import("https://esm.sh/@opendocsg/pdf2md");
    const pdf2md: (buf: Uint8Array) => Promise<string> =
      (mod as any).default ?? mod;
    const buf = new Uint8Array(await file.arrayBuffer());
    const raw = await pdf2md(buf);
    const pages = raw.split(/<!-- PAGE_BREAK -->\n?/);
    const withMarkers = pages
      .map((p, i) => `<!-- Page ${i + 1} -->\n${p}`)
      .join("\n");
    statusEl.textContent = `Converted ${file.name} (${withMarkers.length.toLocaleString()} chars, ${pages.length} page${pages.length === 1 ? "" : "s"}).`;
    statusEl.className = "url-status ok";
    return withMarkers;
  } catch (err) {
    statusEl.textContent = `PDF conversion failed: ${(err as Error).message}`;
    statusEl.className = "url-status err";
    throw err;
  }
}

function wireInput() {
  const input = $<HTMLTextAreaElement>("#input");
  input.addEventListener("input", () => {
    state.input = input.value;
    rerun();
  });

  // Drag and drop.
  const drop = $("#input-area");
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag-over");
  });
  drop.addEventListener("dragleave", () => {
    drop.classList.remove("drag-over");
  });
  drop.addEventListener("drop", async (e: DragEvent) => {
    e.preventDefault();
    drop.classList.remove("drag-over");
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      try { setInput(await convertPdfToMarkdown(f)); } catch { /* status already rendered */ }
      return;
    }
    const text = await f.text();
    setInput(text);
  });

  // File picker.
  const fileInput = $<HTMLInputElement>("#file-input");
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const text = await f.text();
    setInput(text);
  });

  // PDF file picker.
  const pdfInput = $<HTMLInputElement>("#pdf-input");
  pdfInput.addEventListener("change", async () => {
    const f = pdfInput.files?.[0];
    if (!f) return;
    try {
      const md = await convertPdfToMarkdown(f);
      setInput(md);
    } catch { /* status already rendered */ }
    pdfInput.value = "";
  });

  // URL fetch.
  $<HTMLButtonElement>("#fetch-url-btn").addEventListener("click", async () => {
    const urlInput = $<HTMLInputElement>("#url-input");
    let url = urlInput.value.trim();
    if (!url) return;
    // Auto-convert github.com/blob URLs to raw.githubusercontent.com.
    url = url.replace(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
      "https://raw.githubusercontent.com/$1/$2/$3/$4",
    );
    const statusEl = $("#url-status");
    statusEl.textContent = "Fetching...";
    statusEl.className = "url-status loading";
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }
      const text = await resp.text();
      setInput(text);
      statusEl.textContent = `Loaded ${text.length.toLocaleString()} chars.`;
      statusEl.className = "url-status ok";
    } catch (err) {
      statusEl.textContent = `Failed: ${(err as Error).message}. Many servers block cross-origin fetches; try GitHub raw URLs, or paste the content directly.`;
      statusEl.className = "url-status err";
    }
  });

  $<HTMLButtonElement>("#clear-btn").addEventListener("click", () => {
    setInput("");
    $<HTMLInputElement>("#url-input").value = "";
    $("#url-status").textContent = "";
  });
}

// ---------------------------------------------------------------------------
// Output actions
// ---------------------------------------------------------------------------

function wireOutputActions() {
  $<HTMLButtonElement>("#copy-btn").addEventListener("click", async () => {
    const out = $<HTMLTextAreaElement>("#output").value;
    if (!out) return;
    try {
      await navigator.clipboard.writeText(out);
      flashButton("#copy-btn", "Copied");
    } catch {
      // Fallback: select + execCommand.
      const ta = $<HTMLTextAreaElement>("#output");
      ta.select();
      document.execCommand("copy");
      flashButton("#copy-btn", "Copied");
    }
  });

  $<HTMLButtonElement>("#download-btn").addEventListener("click", () => {
    const out = $<HTMLTextAreaElement>("#output").value;
    if (!out) return;
    const blob = new Blob([out], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trimmed.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  $<HTMLButtonElement>("#aggressive-toggle").addEventListener(
    "change",
    (e) => {
      const on = (e.target as HTMLInputElement).checked;
      state.options.aggressive = on;
      for (const id of AGGRESSIVE_RULE_IDS) {
        state.options.enabled[id] = on;
      }
      renderRuleToggles();
      rerun();
    },
  );

  $<HTMLButtonElement>("#sample-btn").addEventListener("click", () => {
    setInput(SAMPLE_MARKDOWN);
  });
}

function flashButton(sel: string, text: string) {
  const btn = $<HTMLButtonElement>(sel);
  const original = btn.textContent ?? "";
  btn.textContent = text;
  btn.classList.add("flash");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("flash");
  }, 1200);
}

// ---------------------------------------------------------------------------
// Sample
// ---------------------------------------------------------------------------

const SAMPLE_MARKDOWN = `---
title: A Sample Document
author: A. Person
date: 2026-05-23
tags: [demo, markdown, linting]
---

# Welcome ✨✨✨

═══════════════════════════════════════

**This entire paragraph is wrapped in bold for emphasis even though every word is already bold so the bold conveys no information whatsoever.**

## Introduction

In order to understand this document, please note that we will, basically, walk through several concepts. It is important to note that, at this point in time, you should read carefully. Due to the fact that markdown is permissive, many authors write very verbose text.

<!-- TODO: rewrite this section before publishing -->

## Configuration Table

| Key             | Value                                                |
| --------------- | ---------------------------------------------------- |
| host            | localhost                                            |
| port            | 8080                                                 |
| timeout         | 30                                                   |
| retries         | 3                                                    |
| backoff         | exponential                                          |

## Links

Read [the docs](https://example.com/very/long/documentation/path/page?utm_source=newsletter&utm_medium=email&utm_campaign=spring2026) for more.

You can also visit [the same documentation](https://example.com/very/long/documentation/path/page?utm_source=newsletter&utm_medium=email&utm_campaign=spring2026) again for the same info.

A third reference: [see here](https://example.com/very/long/documentation/path/page) is also useful.

---

---

##

🌟 🌟 🌟

Note that this paragraph appears here, repeated for emphasis, but it is the exact same text that appears below in the next section. Note that this paragraph appears here, repeated for emphasis, but it is the exact same text that appears below in the next section.

## Another section

Note that this paragraph appears here, repeated for emphasis, but it is the exact same text that appears below in the next section.

**Warning:** This is a bold-label decorator.

In conclusion, this is a sample.
`;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  wireInput();
  wireOutputActions();
  renderRuleToggles();
  renderEmpty();
});
