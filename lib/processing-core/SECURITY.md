# Processing core security invariants

Phase 1 treats filenames, MIME hints, and extensions as untrusted input. An extension never establishes actual format support. The core must fail closed and preserve uncertain or unsupported fields.

Phase 2 adds inspection-only JPEG support. JPEG input must begin with the SOI marker and is walked segment-by-segment with bounds checks, minimum segment lengths, deterministic malformed-input errors, and a 32 MiB inspection limit. The adapter reads through `LocalInput`; it never opens filesystem paths directly. No output artifacts are created and the original input is never a mutable output target.

The Phase 2 adapter identifies EXIF, XMP, JPEG comments, ICC profile segments, and deterministic embedded-metadata presence indicators. It does not decode arbitrary EXIF tags or claim support for ambiguous payloads. Discovered fields remain `UNKNOWN` unless the existing policy justifies a stronger classification; ICC byte presence is `PROTECTED`. No metadata is removed or edited.

Before future parsing expands, the implementation must add explicit byte, file-count, time, memory, and output-size limits. Processing failures must leave the original untouched. Temporary artifacts and object URLs must be isolated, retained only in memory, and released on success, failure, and cancellation.

Adapters must remain side-effect free with respect to the network, remote storage, telemetry, cookies, and authentication. Errors exposed by the boundary must be typed and sanitized; parser exceptions and file contents must not leak through the public result model.
