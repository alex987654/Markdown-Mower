import { Rule, RuleResult } from "../types.js";
import { findCodeFenceRanges } from "./comments.js";

// Identify GFM tables and apply two passes:
//  1. Strip extraneous cell-padding spaces. GFM allows but does not require
//     spaces around cell content; many generators (Excel exports, doc tools)
//     emit cells like "| value      |" padded for visual alignment. The
//     padding is purely cosmetic and tokenizes per character.
//  2. Detect 2-column key/value tables (header row has 2 cells, e.g.
//     "| Key | Value |"). These can almost always be expressed more
//     token-efficiently as a list ("- Key: Value"). We propose the rewrite
//     but only apply if the user has "aggressive" mode on, since it changes
//     the rendered layout.

interface ParsedTable {
  startLine: number;
  endLine: number;
  headerCells: string[];
  alignmentLine: string;
  rows: string[][];
  rawLines: string[];
}

function parseTables(text: string): ParsedTable[] {
  const fenceRanges = findCodeFenceRanges(text);
  const lines = text.split("\n");
  const lineOffsets: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1);
  }
  const isInFence = (lineIdx: number) =>
    fenceRanges.some(
      (r) => lineOffsets[lineIdx] >= r.start && lineOffsets[lineIdx] < r.end,
    );

  const tables: ParsedTable[] = [];
  let i = 0;
  while (i < lines.length - 1) {
    const headerLine = lines[i];
    const alignLine = lines[i + 1];
    if (
      !isInFence(i) &&
      headerLine.includes("|") &&
      /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(alignLine)
    ) {
      const headerCells = splitTableRow(headerLine);
      if (headerCells.length >= 2) {
        const rows: string[][] = [];
        const rawLines: string[] = [headerLine, alignLine];
        let j = i + 2;
        while (j < lines.length) {
          const row = lines[j];
          if (!row.includes("|") || row.trim() === "") break;
          const cells = splitTableRow(row);
          if (cells.length === 0) break;
          rows.push(cells);
          rawLines.push(row);
          j += 1;
        }
        tables.push({
          startLine: i,
          endLine: j - 1,
          headerCells,
          alignmentLine: alignLine,
          rows,
          rawLines,
        });
        i = j;
        continue;
      }
    }
    i += 1;
  }
  return tables;
}

function splitTableRow(line: string): string[] {
  // GFM: split on |, ignore the leading/trailing empty cells if pipes bookend.
  let s = line;
  // Strip leading/trailing whitespace.
  s = s.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  if (s.trim() === "") return [];
  return s.split("|").map((c) => c.trim());
}

// Pass 1: strip padding from cell content.
export const stripTablePadding: Rule = {
  id: "MD-AI050",
  name: "Strip table cell padding",
  category: "tables",
  severity: "medium",
  description:
    "Remove extraneous spaces inside table cells. GFM treats '| value |' and '|value|' identically; the padding is purely visual.",
  run(text): RuleResult {
    const tables = parseTables(text);
    if (tables.length === 0) return { text, diagnostics: [] };
    const lines = text.split("\n");
    let occurrences = 0;
    let saved = 0;
    let sample = "";

    for (const t of tables) {
      // Build a compact rewrite of each row.
      const compactHeader = "|" + t.headerCells.join("|") + "|";
      const compactAlign = compactAlignmentRow(t.alignmentLine);
      const compactRows = t.rows.map((cells) => "|" + cells.join("|") + "|");

      const oldLines = lines.slice(t.startLine, t.endLine + 1);
      const newLines = [compactHeader, compactAlign, ...compactRows];

      const before = oldLines.join("\n");
      const after = newLines.join("\n");

      if (after.length < before.length) {
        occurrences += 1;
        saved += before.length - after.length;
        if (!sample) sample = oldLines[0];
        // Splice into lines array.
        lines.splice(t.startLine, t.endLine - t.startLine + 1, ...newLines);
        // Adjust subsequent table offsets — recompute by re-parsing next iteration if needed.
        // We've already computed all tables up front; if a later table's
        // indices shift, we just stop processing and accept partial work.
        const shift = newLines.length - oldLines.length;
        for (const u of tables) {
          if (u !== t && u.startLine > t.startLine) {
            u.startLine += shift;
            u.endLine += shift;
          }
        }
      }
    }

    if (occurrences === 0) return { text, diagnostics: [] };
    return {
      text: lines.join("\n"),
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: this.severity,
          message: `Compacted ${occurrences} table(s) by stripping cell padding.`,
          detail:
            "GFM does not require padding spaces. Many doc generators emit padded cells for visual alignment in source; this is invisible in rendered output and pure overhead for an LLM.",
          occurrences,
          charsSaved: saved,
          sampleBefore: sample
            ? sample.length > 60
              ? sample.slice(0, 60) + "..."
              : sample
            : undefined,
        },
      ],
    };
  },
};

function compactAlignmentRow(align: string): string {
  // Preserve alignment markers but collapse dashes.
  let s = align.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells = s.split("|").map((c) => {
    const t = c.trim();
    const left = t.startsWith(":");
    const right = t.endsWith(":");
    let dashes = "---";
    if (left && right) return ":---:";
    if (left) return ":---";
    if (right) return "---:";
    return dashes;
  });
  return "|" + cells.join("|") + "|";
}

// Pass 2: convert two-column tables to definition-style lists.
// Only runs in aggressive mode because it changes the rendered structure.
// "Key | Value" tables have a heading row + alignment row + N data rows;
// total source = (2 + N) lines × pipe overhead. The list form ("- Key: Value")
// is one line per pair with no pipes, typically 30-50% fewer characters.
export const twoColumnTableToList: Rule = {
  id: "MD-AI051",
  name: "Convert 2-column tables to lists (aggressive)",
  category: "tables",
  severity: "high",
  description:
    "Two-column key/value tables tokenize ~30-50% denser as '- Key: Value' lists. Changes rendered layout — off by default.",
  run(text, opts): RuleResult {
    if (!opts.aggressive) return { text, diagnostics: [] };
    const tables = parseTables(text);
    if (tables.length === 0) return { text, diagnostics: [] };
    const lines = text.split("\n");
    let occurrences = 0;
    let saved = 0;
    let sample = "";

    // Process in reverse so line indices stay valid.
    for (let idx = tables.length - 1; idx >= 0; idx -= 1) {
      const t = tables[idx];
      if (t.headerCells.length !== 2) continue;
      // Build the list form.
      const listLines: string[] = [];
      // Use the header cells as a kind of preamble if they're meaningful (not just "Key" / "Value").
      // Otherwise we just emit the data rows as "- key: value".
      const isGenericHeader =
        /^(key|name|item|attribute|field|property)$/i.test(
          t.headerCells[0],
        ) &&
        /^(value|description|content)$/i.test(t.headerCells[1]);
      for (const row of t.rows) {
        if (row.length !== 2) continue;
        listLines.push(`- ${row[0]}: ${row[1]}`);
      }
      if (listLines.length === 0) continue;
      const before = lines.slice(t.startLine, t.endLine + 1).join("\n");
      const after = listLines.join("\n");
      if (after.length < before.length) {
        if (!sample) sample = before.split("\n")[0];
        saved += before.length - after.length;
        occurrences += 1;
        lines.splice(
          t.startLine,
          t.endLine - t.startLine + 1,
          ...listLines,
        );
      }
    }
    if (occurrences === 0) return { text, diagnostics: [] };
    return {
      text: lines.join("\n"),
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: this.severity,
          message: `Converted ${occurrences} two-column table(s) to bullet lists.`,
          detail:
            "Aggressive change: visual rendering shifts from a table to a bullet list. Recommended only for AI-target documents.",
          occurrences,
          charsSaved: saved,
          sampleBefore: sample,
        },
      ],
    };
  },
};

// Pass 3 (info only): flag very wide tables for human review. Tables with
// many columns or many rows compound the token-per-cell overhead.
export const flagWideTables: Rule = {
  id: "MD-AI052",
  name: "Flag wide tables for review",
  category: "tables",
  severity: "medium",
  description:
    "Report tables with five or more columns. Wide tables often pay heavy padding/pipe overhead per cell and may be more efficient in a different format.",
  run(text): RuleResult {
    const tables = parseTables(text);
    const wide = tables.filter((t) => t.headerCells.length >= 5);
    if (wide.length === 0) return { text, diagnostics: [] };
    const sample = wide[0].rawLines[0];
    return {
      text,
      diagnostics: [
        {
          ruleId: this.id,
          ruleName: this.name,
          category: this.category,
          severity: this.severity,
          message: `Flagged ${wide.length} wide table(s) (≥5 columns) for review.`,
          detail:
            "Wide tables tend to be where token cost concentrates. Options: trim columns; split into multiple narrower tables; or, for AI-target docs, consider an alternative representation (newline-separated records, JSON, or a denser 'TOON'-style format).",
          occurrences: wide.length,
          charsSaved: 0,
          sampleBefore: sample.length > 60 ? sample.slice(0, 60) + "..." : sample,
        },
      ],
    };
  },
};
