# Processing core security invariants

Phase 1 treats filenames, MIME hints, and extensions as untrusted input. An extension never establishes actual format support. The core must fail closed and preserve uncertain or unsupported fields.

Before real parsing is introduced, the implementation must add explicit byte, file-count, time, memory, and output-size limits. The original input is never a mutable output target. Processing failures must leave the original untouched. Temporary artifacts and object URLs must be isolated, retained only in memory, and released on success, failure, and cancellation.

Adapters must remain side-effect free with respect to the network, remote storage, telemetry, cookies, and authentication. Errors exposed by the boundary must be typed and sanitized; parser exceptions and file contents must not leak through the public result model.
