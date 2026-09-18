# NoTrace Engineering

## Purpose
Project-level rules for changing NoTrace without weakening its local-first privacy promise or confusing the current prototype with a production processor.

## Core rules
- Treat the existing NoTrace UI as a contract: preserve routes, labels, interaction states, disclosure text, and the explicit prototype boundary unless the task explicitly changes them.
- Keep the demo honest. `lib/notrace-demo.ts` and related screens use illustrative metadata and reports; never present simulated inspection, sanitization, verification, risk, or file processing as real.
- Keep original media immutable. Any future processing path must produce a separate artifact, retain an explicit before/after relationship, and make partial or unsupported results visible.
- Prefer browser-local, session-scoped state. Do not add uploads, analytics, cookies, accounts, telemetry, or persistent identifiers without a documented privacy decision and user-facing disclosure.
- Do not add dependencies, services, or build configuration merely to solve a local feature. Reuse existing project primitives and conventions.
- Keep client/server boundaries deliberate: browser file APIs and object URLs stay client-side; never serialize raw media or sensitive metadata into server-rendered props, logs, URLs, or error messages.
- Make capability claims explicit. Distinguish safe-to-remove, editable, protected, unknown, unsupported, and not-yet-analyzed states; never silently broaden a policy.
- Treat user-visible reports as evidence, not authority. Include scope, policy, actions, preserved fields, unsupported fields, and verification status.

## Threat considerations
Assume curious users, malicious files, browser extension interference, accidental disclosure through logs/history, and UI copy that overpromises privacy. Review every filename, metadata value, error, downloaded report, and URL for information leakage. Consider object-URL lifetime, drag-and-drop handling, stale session state, and cross-file mixing.

## Testing expectations
Before handoff, inspect the diff to confirm application source changes are in scope and no dependency files changed unexpectedly. Exercise success, partial, unsupported, cancellation/error, clear-session, reload, and original-file-untouched paths. Verify privacy copy matches behavior, object URLs are revoked, sensitive values do not reach console/network/navigation, and accessibility remains intact. Prefer focused static checks and the existing project build; do not install packages.
