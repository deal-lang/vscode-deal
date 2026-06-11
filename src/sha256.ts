// sha256.ts — streaming SHA-256 helper used by bootstrap.ts to verify
// downloaded deal-lsp binaries against the compiled-in manifest (T-3-01
// binary-tamper mitigation gate).
//
// Pure Node crypto + fs + stream/promises — no external deps. Both helpers
// return lowercase hex digests so manifest comparisons are case-insensitive
// only at the manifest-author level (manifest stays lowercase by convention).

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Stream the file at `filePath` through SHA-256 and return the lowercase
 * hex digest. Used at runtime to verify the auto-downloaded deal-lsp binary
 * against the SHA256_MANIFEST baked into bootstrap.ts at package time.
 */
export async function sha256File(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    await pipeline(createReadStream(filePath), hash);
    return hash.digest('hex');
}

/**
 * Synchronous SHA-256 over an in-memory buffer. Used by the patch-bootstrap-sha
 * build script (when invoked from a test harness) and by the auto-download
 * test suite to construct expected hashes for fixtures.
 */
export function sha256Buffer(buf: Uint8Array): string {
    return createHash('sha256').update(buf).digest('hex');
}
