// Smoke test for the rule pipeline. Runs against the compiled output in dist/,
// so run `npm run build` first. Usage: npm run smoke
import { lint, defaultRuleOptions, AGGRESSIVE_RULE_IDS } from "./dist/linter.js";

let failures = 0;

function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function run(input, { aggressive = false } = {}) {
  const opts = defaultRuleOptions();
  if (aggressive) {
    opts.aggressive = true;
    for (const id of AGGRESSIVE_RULE_IDS) opts.enabled[id] = true;
  }
  return lint(input, opts);
}

// --- Empty input ------------------------------------------------------------
{
  const r = run("");
  check("empty input produces empty output", r.optimized === "");
  check("empty input produces no diagnostics", r.diagnostics.length === 0);
}

// --- URL tracking parameters ------------------------------------------------
{
  const r = run("See [docs](https://example.com/page?utm_source=a&utm_medium=b).\n");
  check(
    "all-tracking query string is removed entirely",
    r.optimized.includes("https://example.com/page)"),
    `got: ${r.optimized.trim()}`,
  );
}
{
  // Regression: tracking param first, real param second — the "?" must survive.
  const r = run("See [docs](https://example.com/page?utm_source=a&real=1).\n");
  check(
    "mixed query string keeps real param with '?'",
    r.optimized.includes("https://example.com/page?real=1"),
    `got: ${r.optimized.trim()}`,
  );
}

// --- HTML comments ----------------------------------------------------------
{
  const r = run("Hello\n<!-- editorial secret -->\nWorld\n");
  check("HTML comment removed", !r.optimized.includes("editorial secret"));
  const r2 = run("<!-- prettier-ignore -->\nHello\n");
  check("tooling directive preserved", r2.optimized.includes("prettier-ignore"));
  const r3 = run("```\n<!-- inside fence -->\n```\n");
  check("comment inside code fence preserved", r3.optimized.includes("inside fence"));
}

// --- Verbosity --------------------------------------------------------------
{
  const r = run("In order to test this, read the docs due to the fact that they exist.\n");
  check("'in order to' compressed", r.optimized.includes("To test this"), `got: ${r.optimized.trim()}`);
  check("'due to the fact that' compressed", r.optimized.includes("because they exist"), `got: ${r.optimized.trim()}`);
}
{
  const r = run("```\nin order to keep code untouched\n```\n");
  check("verbosity skips code fences", r.optimized.includes("in order to keep code untouched"));
}
{
  check("hedge-deletion rule is aggressive-gated", AGGRESSIVE_RULE_IDS.has("MD-AI081"));
  check("hedge-deletion rule disabled by default", defaultRuleOptions().enabled["MD-AI081"] === false);
  const input = "This is basically a very simple test.\n";
  const r = run(input);
  check("hedge words kept by default", r.optimized.includes("basically") && r.optimized.includes("very"), `got: ${r.optimized.trim()}`);
  const r2 = run(input, { aggressive: true });
  check("aggressive mode removes hedge words", !r2.optimized.includes("basically") && !r2.optimized.includes("very"), `got: ${r2.optimized.trim()}`);
}

// --- Tables -----------------------------------------------------------------
const TABLE = [
  "| Key     | Value     |",
  "| ------- | --------- |",
  "| host    | localhost |",
  "| port    | 8080      |",
  "",
].join("\n");
{
  const r = run(TABLE);
  check("table padding stripped", r.optimized.includes("|host|localhost|"), `got: ${r.optimized.trim()}`);
  check("table stays a table without aggressive mode", r.optimized.includes("|Key|Value|"));
}
{
  const r = run(TABLE, { aggressive: true });
  check("aggressive mode converts 2-col table to list", r.optimized.includes("- host: localhost"), `got: ${r.optimized.trim()}`);
}

// --- Repeated links → references -------------------------------------------
{
  const url = "https://example.com/very/long/documentation/path";
  const r = run(`Read [the docs](${url}) and [again](${url}).\n`);
  const defCount = (r.optimized.match(/^\[1\]: /gm) ?? []).length;
  check("repeated URL converted to reference style", r.optimized.includes("[the docs][1]"), `got: ${r.optimized.trim()}`);
  check("exactly one reference definition emitted", defCount === 1, `got ${defCount}`);
}

// --- Whitespace / noise -----------------------------------------------------
{
  const r = run("# Title   \n\n\n\n\nBody text here.\n");
  check("trailing whitespace trimmed", !/[ \t]\n/.test(r.optimized));
  check("blank-line runs collapsed", !/\n{4,}/.test(r.optimized));
}

// --- Stats sanity -----------------------------------------------------------
{
  const r = run("Please note that this is, basically, a very simple test.\n");
  check("chars-after matches optimized length", r.stats.charsAfter === r.optimized.length);
  check("token low bound ≤ high bound", r.stats.tokensAfterLow <= r.stats.tokensAfterHigh);
  check("shrinking text shrinks char count", r.stats.charsAfter < r.stats.charsBefore);
}

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
