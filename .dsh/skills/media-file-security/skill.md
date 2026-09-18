# Media File Security

## Purpose
Define safe handling for hostile, malformed, oversized, or privacy-sensitive media inputs in NoTrace.

## Rules
- Treat every dropped or selected `File` as untrusted bytes. Validate type by content and parser capability, not only `name` or `File.type`; reject ambiguity rather than guessing.
- Bound file size, dimensions, duration, frame count, decompression ratio, recursion depth, metadata volume, and processing time before expensive decode or rendering. Use cancellation and cleanup on every path.
- Never execute, evaluate, or dynamically import content from a media file. Keep parsing and previewing separated from the UI; do not trust embedded scripts, ICC profiles, XMP, thumbnails, captions, links, or codec claims.
- Defend against polyglots, extension/MIME mismatches, decompression bombs, malformed containers, parser differentials, zip-bomb-like archives, crafted SVG/HTML, and resource exhaustion.
- Render previews safely: use inert browser primitives, constrain dimensions, avoid injecting untrusted markup, and do not expose raw media through a server route. Revoke object URLs when no longer needed.
- Preserve originals. Write output to a new blob/file only after successful validation; never overwrite a user-selected source. Make failed, partial, and skipped transformations explicit.
- Sanitize output containers according to a declared policy. Do not claim that re-encoding removes all provenance, hidden channels, or content credentials unless verified by format-specific tests.
- Keep unsupported formats and parser errors actionable but non-sensitive; do not echo raw payloads or giant exception strings.

## Threat considerations
Consider decompression/resource exhaustion, browser decoder vulnerabilities, active content in SVG/PDF-like formats, metadata-triggered parser bugs, symlink/path confusion in any future server integration, and cross-file state contamination. Assume attacker-controlled filenames and MIME declarations.

## Testing expectations
Use synthetic adversarial fixtures for mismatched types, truncated files, huge dimensions, extreme compression, malformed metadata, duplicate names, empty files, cancellation, and unsupported formats. Assert bounded memory/time behavior, safe previewing, no network request, output/original separation, cleanup after success and failure, and honest partial results. Do not add real user files to the repository.
