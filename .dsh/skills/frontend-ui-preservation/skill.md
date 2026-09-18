# Frontend UI Preservation

## Purpose
Protect the current NoTrace v0 visual and interaction language while enabling narrowly scoped work around it.

## Preservation contract
- Do not modify the existing v0 UI, routes, copy, layout hierarchy, design tokens, responsive breakpoints, demo scenarios, or accessibility behavior unless the task explicitly authorizes a UI change.
- Treat `components/notrace/*`, `components/ui/*`, `app/*`, and the established styles as protected application surface for skill-driven work. Prefer documentation, tests, or isolated additions over edits to those files.
- Preserve the liquid-glass visual system: dark palette, restrained lavender accent, borders, spacing rhythm, typography hierarchy, motion restraint, and local/privacy indicators. Do not replace it with generic dashboard patterns.
- Preserve semantics and state communication: keyboard access, skip link, focus-visible treatment, reduced-motion behavior, `aria-current`, dialog labeling, disabled states, and clear success/partial/error distinctions.
- Do not add visual polish that changes meaning. A badge, progress indicator, risk color, or “verified” label must correspond to a real state and use existing terminology.
- Keep prototype disclosures prominent and truthful. Never remove “simulated,” “frontend prototype,” “local,” or “nothing is stored” language to make a flow appear more complete.
- Avoid incidental churn: no formatter-wide rewrites, token renames, dependency upgrades, or unrelated responsive changes.

## Threat considerations
UI is a security boundary: dark glass, green indicators, and confident microcopy can create false assurance. Watch for dark-pattern confirmation, hidden destructive actions, misleading local-only claims, inaccessible error states, focus traps, and sensitive filenames exposed in persistent chrome, screenshots, document titles, or browser history.

## Testing expectations
Use a before/after review at desktop and narrow mobile widths. Check every existing route and navigation state, keyboard-only operation, screen-reader names for icon buttons, focus return from modals, reduced-motion preference, drag/drop and file-picker affordances, loading/partial/error/empty states, and clear-session behavior. Confirm no protected application files were changed when the task is documentation-only.
