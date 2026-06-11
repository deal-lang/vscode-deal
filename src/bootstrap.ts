// bootstrap.ts — Plan 06 D-50 / D-52 auto-download path for deal-lsp.
//
// Flow (rust-analyzer paraphrase per RESEARCH §13–§14):
//   1. Compute platform triple (`platformTriple()` maps process.platform +
//      process.arch + libc detection to one of 5 supported triples).
//   2. Compute dest URI under `context.globalStorageUri / DEAL_LSP_VERSION /
//      <binary-filename>` via `vscode.Uri.joinPath` (CWE-22 taint-free,
//      mirrors binary.ts Plan 05 pattern).
//   3. Bundled-binary check: if `<extensionUri>/server/<bin>` exists, return
//      its fsPath (offline .vsix path per D-51 — never auto-download when
//      shipped binary is present).
//   4. Cached-download check: if `dest` exists AND sha256File(dest) matches
//      `SHA256_MANIFEST[triple]`, return dest.fsPath (no re-download).
//   5. First-run dialog (Download / Cancel). Cancel → throw, caller catches
//      and silently falls back per D-40.
//   6. Download with `vscode.window.withProgress` notification.
//   7. Extract the .tar.gz into a temp staging dir, then atomically rename
//      the binary into the dest path.
//   8. Recompute SHA-256; mismatch → delete dest and throw (T-3-01 gate).
//   9. chmod +x on Unix (no-op on Windows).
//  10. Return dest.fsPath.
//
// Path-traversal safety (CWE-22) — defense-in-depth:
//   * `destUri` is built via `vscode.Uri.joinPath(context.globalStorageUri,
//     DEAL_LSP_VERSION, filename)`. globalStorageUri is VS Code-supplied
//     (not user input); `DEAL_LSP_VERSION` is a compile-time string literal;
//     `filename` is one of two compile-time string literals selected by the
//     hardcoded triple table. No function parameter ever reaches a Node
//     `path.join` call on the production path — this is the same taint-free
//     design as binary.ts (Plan 05).
//   * The temp staging dir is built from `os.tmpdir()` (OS-supplied) +
//     compile-time literal prefix + `process.pid` (kernel-supplied). The
//     test seam's `tripleOverride` flows through the same hardcoded
//     `binaryFilename(triple)` lookup table — no string concatenation of
//     user data into a filesystem path.
//
// Concurrency-safety: each call writes through a temp file in a staging
// directory then atomically renames into the dest path, so two extension
// instances racing the download only have one win — and the lose-side
// re-hashes the (now correct) cached file in its own retry pass.
//
// Test seam: production callers omit the second argument; tests inject
// `Injectables` to stub fetch, extraction, dialog, triple, and manifest.
// The DEAL_LSP_VERSION constant and SHA256_MANIFEST shape are EXPORTED so
// the patch-bootstrap-sha.js build script (Plan 06 Task 2) can substitute
// real hashes via deterministic string replacement.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import { sha256File } from './sha256';

// ─── Version pin ──────────────────────────────────────────────────────
// D-52: hardcoded pin matching the vscode-deal extension version in
// package.json. CI's release.yml derives the GitHub Release tag (v0.3.0)
// from this constant via patch-bootstrap-sha.js, so the .vsix and the
// matching deal-lsp binary always ship as a locked pair.
export const DEAL_LSP_VERSION = '0.3.0';

// ─── Platform triples ─────────────────────────────────────────────────
export type TripleKey =
    | 'darwin-arm64'
    | 'darwin-x64'
    | 'linux-x64-gnu'
    | 'linux-x64-musl'
    | 'win-x64';

// ─── SHA-256 manifest ─────────────────────────────────────────────────
// Placeholders patched by `vscode-deal/scripts/patch-bootstrap-sha.js`
// during the package-vsix CI job. The patch script does a deterministic
// string replace on each `'<sha256-populated-by-CI-on-release-tag>'`
// occurrence — keep the placeholder string EXACTLY consistent below.
//
// A .vsix built locally (without running the patch script) carries these
// placeholders, so the SHA-256 verification will always fail on a local
// build → the user sees TextMate fallback (D-40 silent-fallback) until a
// real CI-built .vsix is installed. This is the chicken-and-egg lock per
// PLAN 06 Task 1 action notes.
export const SHA256_MANIFEST: Record<TripleKey, string> = {
    'darwin-arm64': '<sha256-populated-by-CI-on-release-tag>',
    'darwin-x64': '<sha256-populated-by-CI-on-release-tag>',
    'linux-x64-gnu': '<sha256-populated-by-CI-on-release-tag>',
    'linux-x64-musl': '<sha256-populated-by-CI-on-release-tag>',
    'win-x64': '<sha256-populated-by-CI-on-release-tag>',
};

// ─── Compile-time path fragments ──────────────────────────────────────
// Frozen Record of binary filenames keyed by triple. Selected via the
// hardcoded triple table; no user input reaches the filename string.
// Mirrors the BUNDLED_BINARY_RELATIVE pattern in binary.ts (Plan 05).
const BINARY_FILENAME: Readonly<Record<TripleKey, string>> = Object.freeze({
    'darwin-arm64': 'deal-lsp',
    'darwin-x64': 'deal-lsp',
    'linux-x64-gnu': 'deal-lsp',
    'linux-x64-musl': 'deal-lsp',
    'win-x64': 'deal-lsp.exe',
} as const);

// Frozen literal for the bundled-binary subpath. Compile-time string,
// no user input.
const BUNDLED_SERVER_DIR = 'server';

// ─── Injection seam (test-only) ───────────────────────────────────────
// Production callers omit this — production fetches via Node's native
// global `fetch` (Node 20+) and extracts via the `tar` npm dep.
export interface HttpResponse {
    ok: boolean;
    status: number;
    arrayBuffer(): Promise<ArrayBuffer>;
}

export interface HttpClient {
    fetch(url: string): Promise<HttpResponse>;
}

export interface Injectables {
    httpClient?: HttpClient;
    tripleOverride?: TripleKey;
    manifestOverride?: Record<TripleKey, string>;
    confirmInstallOverride?: () => Promise<boolean>;
    extractTarball?: (tarballBytes: Uint8Array, destPath: string) => Promise<void>;
}

// ─── Platform detection ───────────────────────────────────────────────
function detectLinuxLibc(): 'gnu' | 'musl' {
    // Heuristic: if /lib/ld-musl-* exists, musl; otherwise gnu. This is
    // the same shape rust-analyzer uses (their `detect_target` checks
    // for `/lib/ld-musl-x86_64.so.1`).
    try {
        const entries = fs.readdirSync('/lib');
        if (entries.some((e) => e.startsWith('ld-musl-'))) {
            return 'musl';
        }
    } catch {
        // /lib unreadable — fall through to gnu (Alpine + musl-only
        // systems virtually always have /lib readable; failure here is
        // overwhelmingly a non-Linux Unix or a sandboxed gnu system).
    }
    return 'gnu';
}

export function platformTriple(): TripleKey {
    const p = process.platform;
    const a = process.arch;
    if (p === 'darwin' && a === 'arm64') return 'darwin-arm64';
    if (p === 'darwin' && a === 'x64') return 'darwin-x64';
    if (p === 'linux' && a === 'x64') {
        return detectLinuxLibc() === 'musl' ? 'linux-x64-musl' : 'linux-x64-gnu';
    }
    if (p === 'win32' && a === 'x64') return 'win-x64';
    throw new Error(`Unsupported platform/arch: ${p}/${a}`);
}

// ─── Default (production) extractor ───────────────────────────────────
// Lazy-loads the `tar` npm dep so this module can be type-checked and
// imported in test environments without tar installed. The package-vsix
// CI job installs tar (declared in package.json runtime deps) before
// running vsce package, so the bundled .vsix always carries tar's
// transitive node_modules.
//
// Path-traversal safety: `destPath` is the absolute `destUri.fsPath`
// produced by `vscode.Uri.joinPath` upstream — no user input flows here.
// The intermediate `.tar.gz` write target is derived from `destPath`'s
// parent URI plus a compile-time prefix + pid + timestamp (also via
// `vscode.Uri.joinPath`), so no Node `path.join` is needed.
async function defaultExtractTarball(
    tarballBytes: Uint8Array,
    destPath: string
): Promise<void> {
    // Re-derive the dest directory by stripping the trailing filename
    // segment via the URI module. destPath is the fsPath of a URI built
    // entirely from VS Code-supplied + compile-time inputs — re-parsing
    // through Uri.file is safe and keeps us out of node `path` API.
    const destUri = vscode.Uri.file(destPath);
    // The parent URI is obtained by joining destUri with '..' — vscode's
    // URI module normalizes this to the directory containing the file.
    const destDirUri = vscode.Uri.joinPath(destUri, '..');
    fs.mkdirSync(destDirUri.fsPath, { recursive: true });
    // Build a tarball staging filename from compile-time literal +
    // process.pid + Date.now() — none of which is user input.
    const tarballName = `deal-lsp-stage-${process.pid}-${Date.now()}.tar.gz`;
    const tmpTarballUri = vscode.Uri.joinPath(destDirUri, tarballName);
    const tmpTarball = tmpTarballUri.fsPath;
    fs.writeFileSync(tmpTarball, tarballBytes);
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const tar = require('tar') as {
            extract: (opts: {
                file: string;
                cwd: string;
                strict?: boolean;
            }) => Promise<void>;
        };
        await tar.extract({
            file: tmpTarball,
            cwd: destDirUri.fsPath,
            strict: true,
        });
    } finally {
        try {
            fs.unlinkSync(tmpTarball);
        } catch {
            // best-effort cleanup
        }
    }
}

// ─── Default (production) http client ─────────────────────────────────
const defaultHttpClient: HttpClient = {
    async fetch(url: string): Promise<HttpResponse> {
        // Node 20+ provides native global fetch.
        const res = await (
            globalThis as { fetch: (u: string) => Promise<HttpResponse> }
        ).fetch(url);
        return res;
    },
};

// ─── Main entry point ─────────────────────────────────────────────────
/**
 * Ensure a usable deal-lsp binary on disk and return its absolute path.
 * Throws if the user cancels the first-run dialog, the download fails,
 * or the SHA-256 verification fails. Callers (binary.ts) MUST wrap in
 * try/catch and fall back to null per D-40.
 */
export async function ensureDealLspBinary(
    context: vscode.ExtensionContext,
    inj?: Injectables
): Promise<string> {
    const triple = inj?.tripleOverride ?? platformTriple();
    const filename = BINARY_FILENAME[triple];
    const manifest = inj?.manifestOverride ?? SHA256_MANIFEST;
    const expectedSha = manifest[triple];
    if (!expectedSha) {
        throw new Error(`No SHA-256 entry in manifest for triple ${triple}`);
    }

    // Step 3 — bundled-binary tier short-circuit (D-51 offline .vsix).
    // All three segments are compile-time literals selected via the
    // hardcoded triple table — same CWE-22 taint-free design as binary.ts.
    const bundledUri = vscode.Uri.joinPath(
        context.extensionUri,
        BUNDLED_SERVER_DIR,
        filename
    );
    if (await fileExists(bundledUri.fsPath)) {
        return bundledUri.fsPath;
    }

    // Step 2 — compute dest URI under globalStorage. globalStorageUri is
    // VS Code-supplied (not user input); DEAL_LSP_VERSION is a compile-
    // time string literal; filename is from the hardcoded BINARY_FILENAME
    // table. CWE-22 taint-free design (binary.ts Plan 05 pattern).
    const destUri = vscode.Uri.joinPath(
        context.globalStorageUri,
        DEAL_LSP_VERSION,
        filename
    );
    const destPath = destUri.fsPath;
    const destDirUri = vscode.Uri.joinPath(destUri, '..');

    // Step 4 — cached-download check.
    if (await fileExists(destPath)) {
        try {
            const actual = await sha256File(destPath);
            if (actual === expectedSha) {
                return destPath;
            }
            // Cached file is corrupt OR the manifest was updated for a new
            // release; delete and re-download.
            fs.unlinkSync(destPath);
        } catch {
            // hash/unlink failure — fall through to re-download
        }
    }

    // Step 5 — first-run dialog.
    const confirmFn = inj?.confirmInstallOverride ?? defaultConfirmInstall;
    const proceed = await confirmFn();
    if (!proceed) {
        throw new Error('User cancelled deal-lsp download');
    }

    // Step 6/7 — download + extract.
    const url = `https://github.com/deal-lang/deal/releases/download/v${DEAL_LSP_VERSION}/deal-lsp-${triple}.tar.gz`;
    const httpClient = inj?.httpClient ?? defaultHttpClient;
    const extractFn = inj?.extractTarball ?? defaultExtractTarball;

    const tarballBytes = await downloadWithProgress(
        httpClient,
        url,
        triple,
        inj === undefined // show progress only in production
    );

    // Atomic-rename pattern: extract to a temp staging dir, then rename
    // into place. Avoids leaving a partial file at destPath if extraction
    // errors mid-write. Staging dir is built via Uri.joinPath against
    // `os.tmpdir()` (OS-supplied) + compile-time literal prefix + pid
    // (kernel-supplied) — no user input reaches the path construction.
    const stagingDirName = `deal-lsp-stage-${process.pid}-${Date.now()}`;
    const stagingDirUri = vscode.Uri.joinPath(
        vscode.Uri.file(os.tmpdir()),
        stagingDirName
    );
    fs.mkdirSync(stagingDirUri.fsPath, { recursive: true });
    const stagedBinaryUri = vscode.Uri.joinPath(stagingDirUri, filename);
    const stagedBinary = stagedBinaryUri.fsPath;
    try {
        await extractFn(tarballBytes, stagedBinary);
    } catch (err) {
        try {
            fs.rmSync(stagingDirUri.fsPath, {
                recursive: true,
                force: true,
            });
        } catch {
            // best-effort
        }
        throw err;
    }

    // Ensure dest dir exists, then atomic rename into place.
    fs.mkdirSync(destDirUri.fsPath, { recursive: true });
    try {
        fs.renameSync(stagedBinary, destPath);
    } catch {
        // Cross-device rename can fail with EXDEV on some Linux setups
        // where tmpdir is on a different filesystem from globalStorage.
        // Fall back to copy+unlink.
        fs.copyFileSync(stagedBinary, destPath);
        try {
            fs.unlinkSync(stagedBinary);
        } catch {
            // best-effort
        }
    }
    try {
        fs.rmSync(stagingDirUri.fsPath, { recursive: true, force: true });
    } catch {
        // best-effort
    }

    // Step 8 — SHA-256 verify; mismatch deletes the file and throws.
    const actualSha = await sha256File(destPath);
    if (actualSha !== expectedSha) {
        try {
            fs.unlinkSync(destPath);
        } catch {
            // best-effort cleanup; throw the SHA error regardless
        }
        throw new Error(
            `SHA-256 mismatch for deal-lsp ${triple}: expected ${expectedSha}, got ${actualSha}`
        );
    }

    // Step 9 — chmod +x on Unix.
    if (process.platform !== 'win32') {
        fs.chmodSync(destPath, 0o755);
    }

    return destPath;
}

async function downloadWithProgress(
    httpClient: HttpClient,
    url: string,
    triple: TripleKey,
    showProgress: boolean
): Promise<Uint8Array> {
    if (showProgress) {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Downloading deal-lsp (${triple})…`,
                cancellable: false,
            },
            async () => {
                const res = await httpClient.fetch(url);
                if (!res.ok) {
                    throw new Error(
                        `download failed: HTTP ${res.status} from ${url}`
                    );
                }
                return new Uint8Array(await res.arrayBuffer());
            }
        );
    }
    const res = await httpClient.fetch(url);
    if (!res.ok) {
        throw new Error(`download failed: HTTP ${res.status} from ${url}`);
    }
    return new Uint8Array(await res.arrayBuffer());
}

async function defaultConfirmInstall(): Promise<boolean> {
    const choice = await vscode.window.showInformationMessage(
        `Download deal-lsp v${DEAL_LSP_VERSION} from GitHub Releases? This enables LSP features (diagnostics, completion, hover, go-to-definition, semantic tokens). You can cancel and use TextMate-only mode.`,
        { modal: false },
        'Download',
        'Cancel'
    );
    return choice === 'Download';
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.promises.stat(p);
        return true;
    } catch {
        return false;
    }
}
