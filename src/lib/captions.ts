/**
 * Caption / hook display helpers.
 *
 * When a Draft has both a `selectedHook` and a `caption`, the save path
 * in compose/actions.ts prepends the hook to the caption with a blank
 * line:
 *
 *   draft.caption = `${selectedHook}\n\n${body}`
 *   draft.selectedHook = selectedHook
 *
 * This keeps the publish step trivial — the saved caption is exactly
 * what gets posted, hook included — but it produces visual duplication
 * on every read surface that renders hook AND caption separately
 * (drafts list, schedule cards, preview modal, post-preview component).
 *
 * `stripHookPrefix` removes the prepended hook + the separating
 * whitespace so the caption-as-displayed contains only the body. The
 * underlying stored caption is unchanged.
 *
 * Edge cases handled:
 *  - Null / undefined hook → return caption unchanged
 *  - Caption that doesn't start with hook → return caption unchanged
 *    (the user typed the body without picking a hook later, or pasted
 *    over the hook line)
 *  - Hook with trailing whitespace differences → trim both sides for
 *    the prefix check, but slice on the original to preserve exact
 *    spacing in the body
 */
export function stripHookPrefix(
  caption: string | null | undefined,
  hook: string | null | undefined,
): string {
  if (!caption) return "";
  if (!hook) return caption;
  const h = hook.trim();
  const c = caption;
  // The save path uses `\n\n` between hook and body, but defensive: also
  // tolerate a single \n or leading whitespace in case an older draft
  // was saved with a different separator.
  if (!c.trimStart().startsWith(h)) return caption;
  const afterHook = c.trimStart().slice(h.length).replace(/^[\s]+/, "");
  return afterHook;
}
