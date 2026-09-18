# Metadata Forensics

## Purpose
Provide NoTrace-specific guidance for inspecting, classifying, editing, and reporting provenance signals without overstating certainty.

## Rules
- Separate metadata namespaces and evidence: EXIF, GPS, IPTC, XMP, container atoms, filesystem-derived values, embedded thumbnails, maker notes, content credentials/C2PA, and application history are not interchangeable.
- Preserve raw values, normalized display values, source location, parser confidence, and transformation history as distinct concepts. Never silently coerce time zones, coordinates, encodings, rational values, or vendor extensions.
- Classify every field with an explicit policy: safe to remove, editable, protected/preserved, unknown, unsupported, or not analyzed. “Unknown” is not evidence of absence.
- Correlate fields cautiously. Capture, create, modify, filesystem, and credential timestamps may describe different events; do not infer identity, location, authorship, or editing history from one field alone.
- Treat GPS, serial/device identifiers, author names, copyright, descriptions, thumbnails, face-related tags, and software/history fields as potentially sensitive. Minimize display and redact by default where full values are not needed.
- Do not destroy provenance silently. Explain whether a field was removed, edited, preserved, invalid, absent, or unverifiable, and retain before/after values only where the report policy permits.
- Content credentials and signatures require format-aware verification and chain-of-trust results. An unsigned, invalid, absent, or unsupported manifest is not equivalent to “AI-generated” or “safe.”
- Reports must identify the file, policy/version, scope, parser limitations, actions, preserved fields, skipped fields, and verification status. Simulated/demo data must remain unmistakably labeled.

## Threat considerations
Expect spoofed tags, contradictory timestamps, malformed encodings, oversized values, duplicate namespaces, hidden thumbnails, stale manifests, parser disagreement, and metadata crafted to exploit downstream display or export. Prevent sensitive values from entering logs, URLs, analytics, or broad UI state.

## Testing expectations
Build synthetic fixtures covering absent, duplicated, malformed, contradictory, high-risk, protected, unknown, and signed/unsigned credential cases across supported formats. Test timezone and Unicode handling, redaction, policy classification, before/after reports, partial failures, deterministic ordering, and safe rendering of untrusted labels/values. Verify unsupported fields are reported—not silently dropped—and no raw fixture data leaks outside the intended session.
