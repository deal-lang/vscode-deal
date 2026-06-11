// auto_download.test.ts — electron suite covering the Plan 06 bootstrap.ts
// auto-download path with SHA-256 verification.
//
// Two named tests (gated by 03-VALIDATION.md row 03-06-T1's grep):
//   1. auto_download_url_correct — invokes bootstrap with a stubbed http client;
//      asserts the constructed URL contains both `v${DEAL_LSP_VERSION}` and the
//      `deal-lsp-${platformTriple()}.tar.gz` filename per D-50 / D-52.
//   2. sha256_mismatch_rejects — stub fetch returns known bytes, SHA256_MANIFEST
//      lookup is overridden to an unrelated hash, ensureDealLspBinary throws AND
//      deletes the cached file (T-3-01 binary-tamper mitigation gate).
//
// Both tests inject an `Injectables` seam into bootstrap.ts so the production
// fetch + fs paths are bypassed. The vscode shim is the real one — but a fake
// ExtensionContext (Plan-05-style stub) is constructed so we never depend on
// the LSP binary being on disk.

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { expect } from 'chai';
import {
    DEAL_LSP_VERSION,
    ensureDealLspBinary,
    type Injectables,
} from '../../bootstrap';

function makeContext(globalStorage: string): vscode.ExtensionContext {
    // Minimal stub — only the fields bootstrap.ts touches.
    fs.mkdirSync(globalStorage, { recursive: true });
    // extensionUri points at a tmp dir with NO server/ subdir, so the
    // bundled-binary tier (#3) is bypassed and we always reach the download
    // path (the test's actual subject).
    const extensionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deal-ext-'));
    return {
        globalStorageUri: vscode.Uri.file(globalStorage),
        extensionUri: vscode.Uri.file(extensionRoot),
    } as unknown as vscode.ExtensionContext;
}

describe('auto_download', function () {
    this.timeout(15000);

    it('auto_download_url_correct', async () => {
        const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'deal-store-'));
        const ctx = makeContext(storage);

        let capturedUrl = '';
        const inj: Injectables = {
            httpClient: {
                fetch: async (url: string) => {
                    capturedUrl = url;
                    // Return an empty tarball-shaped buffer; bootstrap will
                    // attempt SHA-256 verification which will fail, but the
                    // URL is captured BEFORE the failure happens — which is
                    // exactly what this test asserts.
                    return {
                        ok: true,
                        status: 200,
                        arrayBuffer: async () => new ArrayBuffer(0),
                    };
                },
            },
            // Force a fixed triple so the assertion doesn't depend on the
            // platform running the tests.
            tripleOverride: 'linux-x64-gnu',
            // Manifest entry the (empty-body) download will NOT match — the
            // test catches the throw and inspects capturedUrl.
            manifestOverride: {
                'darwin-arm64': 'x',
                'darwin-x64': 'x',
                'linux-x64-gnu': 'x',
                'linux-x64-musl': 'x',
                'win-x64': 'x',
            },
            // Auto-confirm the first-run dialog so the test doesn't hang.
            confirmInstallOverride: async () => true,
            // No-op extractor so the test does not depend on the production
            // tar dependency for this assertion (URL capture is the subject).
            extractTarball: async (_bytes: Uint8Array, destPath: string) => {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.writeFileSync(destPath, new Uint8Array(0));
            },
        };

        let threw = false;
        try {
            await ensureDealLspBinary(ctx, inj);
        } catch {
            threw = true;
        }
        expect(threw, 'expected SHA-256 mismatch to throw').to.equal(true);

        expect(capturedUrl).to.include(`v${DEAL_LSP_VERSION}`);
        expect(capturedUrl).to.include('deal-lsp-linux-x64-gnu.tar.gz');
        expect(capturedUrl).to.match(/^https:\/\/github\.com\/deal-lang\/deal\/releases\/download\//);
    });

    it('sha256_mismatch_rejects', async () => {
        const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'deal-store-'));
        const ctx = makeContext(storage);

        // A fake tarball containing one regular file named `deal-lsp` with
        // 32 bytes of "A" inside. We don't need real tar extraction in the
        // test — bootstrap.ts uses injected `extractTarball` so we can write
        // the destination file directly.
        const fakeBinaryBytes = Buffer.alloc(32, 0x41);

        const inj: Injectables = {
            httpClient: {
                fetch: async () => ({
                    ok: true,
                    status: 200,
                    arrayBuffer: async () => fakeBinaryBytes.buffer.slice(
                        fakeBinaryBytes.byteOffset,
                        fakeBinaryBytes.byteOffset + fakeBinaryBytes.byteLength
                    ),
                }),
            },
            tripleOverride: 'linux-x64-gnu',
            manifestOverride: {
                'darwin-arm64': 'wrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrong',
                'darwin-x64': 'wrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrong',
                'linux-x64-gnu': 'wrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrong',
                'linux-x64-musl': 'wrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrong',
                'win-x64': 'wrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrong',
            },
            confirmInstallOverride: async () => true,
            // Injected extractor: write the bytes verbatim to dest, simulating
            // a successful tar extract producing the binary at the target path.
            extractTarball: async (tarballBytes: Uint8Array, destPath: string) => {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.writeFileSync(destPath, tarballBytes);
            },
        };

        let caught: unknown = null;
        try {
            await ensureDealLspBinary(ctx, inj);
        } catch (err) {
            caught = err;
        }
        expect(caught, 'expected SHA-256 mismatch to throw an Error').to.not.equal(null);
        expect(String(caught)).to.match(/sha-?256/i);

        // The file MUST have been deleted after the mismatch (T-3-01 gate).
        const expectedDest = path.join(
            storage,
            DEAL_LSP_VERSION,
            'deal-lsp'
        );
        expect(
            fs.existsSync(expectedDest),
            `cached file at ${expectedDest} should have been deleted on SHA-256 mismatch`
        ).to.equal(false);
    });
});
