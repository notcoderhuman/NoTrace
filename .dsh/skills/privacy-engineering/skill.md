# Privacy Engineering

## Purpose
Apply NoTrace’s local-first promise as an engineering requirement rather than a marketing assumption.

## Rules
- Data minimization is the default: accept only the bytes and fields needed for the requested operation, keep them in memory where practical, and discard them at the earliest safe point.
- No media, metadata, filenames, thumbnails, hashes, reports, or derived signals may leave the browser or be persisted unless a separately approved feature defines the purpose, destination, retention, consent, and deletion behavior.
- Do not introduce analytics, tracking pixels, third-party embeds, remote fonts, cookies, accounts, fingerprinting, crash payloads, or telemetry that can reveal a user’s media or activity.
- Avoid accidental persistence through localStorage, IndexedDB, service-worker caches, browser history, URL query strings/fragments, downloads with sensitive names, React server props, build artifacts, or debug logs.
- Session clear must be meaningful: remove in-memory references, revoke object URLs, clear generated reports and previews, reset derived state, and leave the user’s original device file untouched.
- Explain limits precisely. “Local” does not mean safe from malware, extensions, screenshots, OS backups, browser crash recovery, or a compromised device. State what NoTrace does and does not inspect, remove, verify, or retain.
- Use least privilege for future workers and parsers. Isolate untrusted parsing, bound resource use, and fail closed when an operation cannot establish its promised guarantee.
- Never use real personal media or metadata as fixtures. Redact examples and keep test data synthetic.

## Threat considerations
Model malicious or sensitive filenames and metadata, shared devices, browser persistence, extension access, memory exhaustion, side channels from timing/progress, referrer leakage, copy/download leakage, and users mistaking a simulated result for sanitization. Treat reports as potentially sensitive exports.

## Testing expectations
Audit network activity for every media flow (expected: none), storage APIs, cookies, service workers, console output, document title/history, generated download names, and object-URL cleanup. Test reload, tab close, clear session, multiple files, cancellation, errors, oversized inputs, and unsupported formats. Verify disclosures are adjacent to the relevant action and that partial guarantees are never labeled complete.
