// Central rule registry. The pipeline runs rules in this order — earlier rules
// produce cleaner input for later ones (e.g., trimming whitespace before
// detecting empty headings; removing comments before checking duplication).

import { Rule } from "../types.js";

import {
  removeBom,
  normalizeLineEndings,
  trimTrailingWhitespace,
  collapseBlankLines,
  normalizeInvisibleSpaces,
} from "./whitespace.js";

import {
  normalizeSmartQuotes,
  normalizeEllipsis,
  normalizeDashes,
} from "./punctuation.js";

import { removeHtmlComments } from "./comments.js";

import {
  stripDecorativeBanners,
  collapseHorizontalRules,
  removeEmptyHeaders,
  stripDecorativeEmojiRows,
} from "./noise.js";

import {
  unwrapWholeParagraphEmphasis,
  flagBoldLabels,
} from "./emphasis.js";

import {
  flagOrphanHeadings,
  flagRedundantHeadingText,
} from "./headings.js";

import {
  stripTablePadding,
  twoColumnTableToList,
  flagWideTables,
} from "./tables.js";

import {
  convertRepeatedLinksToReferences,
  stripUrlTrackingParameters,
  flagBareLongUrls,
} from "./links.js";

import { verbosityRewrites } from "./verbosity.js";

import { detectParagraphDuplication } from "./duplication.js";

import {
  analyzeFrontmatter,
  stripFrontmatter,
} from "./frontmatter.js";

import { reportEmojiDensity } from "./emoji.js";

export const ALL_RULES: Rule[] = [
  // 1. Frontmatter analysis (info first, then aggressive strip if enabled).
  analyzeFrontmatter,
  stripFrontmatter,

  // 2. Encoding and whitespace cleanup — cheap, broad benefit, runs first
  //    so downstream rules see normalized text.
  removeBom,
  normalizeLineEndings,
  normalizeInvisibleSpaces,
  trimTrailingWhitespace,

  // 3. Comment removal — must precede rules that look at "surface" structure,
  //    so commented-out content doesn't influence them.
  removeHtmlComments,

  // 4. Punctuation normalization.
  normalizeSmartQuotes,
  normalizeEllipsis,
  normalizeDashes,

  // 5. Noise removal — decorative content that contributes nothing.
  stripDecorativeBanners,
  removeEmptyHeaders,
  stripDecorativeEmojiRows,
  collapseHorizontalRules,

  // 6. Emphasis cleanup.
  unwrapWholeParagraphEmphasis,
  flagBoldLabels,

  // 7. Headings (info only).
  flagOrphanHeadings,
  flagRedundantHeadingText,

  // 8. Table optimization.
  stripTablePadding,
  twoColumnTableToList,
  flagWideTables,

  // 9. Link optimization — runs late so transformed prose doesn't disturb links.
  stripUrlTrackingParameters,
  convertRepeatedLinksToReferences,
  flagBareLongUrls,

  // 10. Verbosity rewrites — operate on prose, after most structural cleanup.
  verbosityRewrites,

  // 11. Whitespace finishing — collapse blank-line runs created by the
  //     earlier removals.
  collapseBlankLines,

  // 12. Emoji and duplication — read-only diagnostics; pure inspection.
  reportEmojiDensity,
  detectParagraphDuplication,
];
