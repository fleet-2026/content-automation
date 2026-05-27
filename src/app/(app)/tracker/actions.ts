"use server";

// Tracker actions — now just re-exports what the page needs.
// The tracker page is read-only (links to /daily-post/[slug] for edits),
// so no mutations are needed here. Kept as a file so future tracker-specific
// actions (bulk publish, export CSV, etc.) have a home.

export {};
