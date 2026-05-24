// Shared types for the trimmer pipeline.
//
// A "rule" inspects markdown text and produces (a) a transformed version of
// that text and (b) a list of diagnostics explaining what changed and why.
// Rules run in a defined sequence; later rules see the output of earlier ones.
export {};
