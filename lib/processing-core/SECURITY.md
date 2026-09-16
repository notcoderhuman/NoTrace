# Processing core security invariants

Phase 1 treats filenames, MIME hints, and extensions as untrusted input. An extension never establishes actual format support. The core must fail closed and preserve uncertain or unsupported fields.

The current pre-engine phase supports bounded structural JPEG inspection and one narrowly scoped, in-memory COM transformation. JPEG input must begin with the SOI marker and is walked segment-by-segment with bounds checks, deterministic malformed-input errors, and a 32 MiB input/output limit. The adapter reads through `LocalInput`; it never opens filesystem paths directly. Output is accepted only after an independent verifier and is never persisted by the core.

The adapter identifies EXIF, XMP, JPEG comments, ICC profile segments, and deterministic embedded-metadata presence indicators. It does not decode arbitrary EXIF tags or claim decoder-level authenticity. Discovered fields remain `UNKNOWN` unless policy justifies a stronger classification; ICC byte presence is `PROTECTED`. Only explicitly approved JPEG COM segments may be removed; all retained bytes and source identity remain bound and verified.

Input/output byte limits are enforced for the current JPEG path. The policy's `maxFiles` is scoped to one real destructive operation; the UI may retain a separate multi-file session queue that never becomes a batch execution request. Cooperative duration limits are advisory, while hard CPU and memory limits are unsupported in the in-process browser runtime and require a terminating worker/process host. Processing failures must leave the original untouched. Temporary artifacts and object URLs must be isolated, retained only in memory, and released on success, failure, and cancellation.

Adapters must remain side-effect free with respect to the network, remote storage, telemetry, cookies, and authentication. Errors exposed by the boundary must be typed and sanitized; parser exceptions and file contents must not leak through the public result model.
