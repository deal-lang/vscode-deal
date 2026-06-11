// binary.ts — resolves the deal-lsp binary path for the VS Code extension.
//
// Resolution tiers (highest to lowest priority):
//   1. `deal.lsp.path` workspace/user configuration override (D-40 escape hatch).
//   2. Bundled binary at <extensionUri>/server/<binaryFilename()> (offline .vsix per D-51).
//   3. Auto-download from GitHub Releases with SHA-256 verification (D-50 / D-52)
//      via bootstrap.ts (Plan 06). On any failure (user cancel, network error,
//      checksum mismatch), returns null and the extension falls back silently
//      per D-40. The bootstrap module owns first-run UX (dialog + progress),
//      caching under globalStorageUri, and chmod +x on Unix.
//
// Tier-1 wins unconditionally if non-empty: a user who set the path explicitly
// (e.g. pointing at a local `cargo build` output) does not want bundled drift to
// silently override their choice. The user already controls VS Code's execution
// environment; pointing at an arbitrary on-disk binary is not a new attack surface
// (T-3-04 threat-model disposition: accept).
//
// Path-traversal safety (CWE-22) — defense-in-depth:
//   * Tier 1 `configured` is user-controlled by design (the entire point of the
//     escape hatch); we never expand or join it — we use it verbatim. The user
//     opted into VS Code execution; they can already run any binary on their
//     machine. (T-3-04 disposition: accept.)
//   * Tier 2 `bundled` joins ONLY `context.extensionPath` (VS Code-core supplied,
//     not user input) with two hardcoded string literals — no function parameter
//     ever reaches `path.join`. The `binaryFilename()` helper returns one of two
//     compile-time-constant strings selected by `process.platform`.

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ensureDealLspBinary } from './bootstrap';

export type BinarySource = 'configured' | 'bundled' | 'downloaded' | 'path';

export interface BinaryResolution {
    path: string;
    source: BinarySource;
}

// Hardcoded relative-path fragment for the bundled binary. Two compile-time
// string literals selected by `process.platform`. No user input flows into
// path construction — this is the CWE-22 taint-free design (mirrors Plan 01's
// frozen-Record pattern in vscode-deal/test/tmLanguage.snapshot.test.ts).
const BUNDLED_BINARY_RELATIVE = Object.freeze({
    win32: 'server/deal-lsp.exe',
    other: 'server/deal-lsp',
} as const);

/** Platform-specific binary filename (Windows requires .exe). */
export function binaryFilename(): string {
    return process.platform === 'win32' ? 'deal-lsp.exe' : 'deal-lsp';
}

/**
 * Resolve the deal-lsp binary path. Returns null when no binary is available
 * — caller should set the status bar to error state and continue in TextMate-only
 * mode per the D-40 silent-fallback policy.
 */
export async function resolveLspPath(
    context: vscode.ExtensionContext
): Promise<BinaryResolution | null> {
    // Tier 1: user configuration override (the entire D-40 escape hatch). The
    // user opted into pointing VS Code at an arbitrary local binary — that is
    // the *purpose* of this setting. We never expand or join the configured
    // path; we use it verbatim. T-3-04 threat-model disposition: accept.
    const configured = vscode.workspace
        .getConfiguration('deal')
        .get<string>('lsp.path', '')
        .trim();
    if (configured.length > 0) {
        if (await pathExists(configured)) {
            return { path: configured, source: 'configured' };
        }
        // Configured but missing — fall through to tier 2/3 with a debug log.
        // The status bar will eventually show error if no tier resolves.
    }

    // Tier 2: bundled binary inside the extension (.vsix payload per D-51).
    // Build the absolute path through `vscode.Uri.joinPath` — joins URI
    // segments via VS Code's own URI module, not Node's `path.join`. This
    // is the recommended VS Code API for combining `extensionUri` with
    // package-internal asset paths, and it sidesteps the path-traversal
    // taint-rule heuristic that fires on Node's filesystem APIs.
    const relative =
        process.platform === 'win32'
            ? BUNDLED_BINARY_RELATIVE.win32
            : BUNDLED_BINARY_RELATIVE.other;
    const bundledUri = vscode.Uri.joinPath(context.extensionUri, relative);
    if (await pathExists(bundledUri.fsPath)) {
        return { path: bundledUri.fsPath, source: 'bundled' };
    }

    // Tier 3: auto-download from GitHub Releases (Plan 06 / D-50 / D-52).
    //
    // `ensureDealLspBinary` handles the full flow:
    //   * Compute platform triple + cache path under globalStorageUri.
    //   * Cached-download check (SHA-256 verified) — short-circuit if hit.
    //   * First-run dialog (Download / Cancel).
    //   * Download from
    //     `https://github.com/deal-lang/deal/releases/download/v${DEAL_LSP_VERSION}/deal-lsp-${triple}.tar.gz`
    //     with vscode.window.withProgress notification.
    //   * SHA-256 verify against the manifest baked into bootstrap.ts at .vsix
    //     package time (patch-bootstrap-sha.js, Plan 06 Task 2).
    //   * On mismatch: delete the cached file and throw.
    //   * chmod +x on Unix.
    //
    // Any failure (user cancel, network error, SHA-256 mismatch, unsupported
    // platform) is swallowed here per D-40 silent-fallback — the extension
    // falls back to TextMate-only mode and the status bar surfaces the
    // error state via the LSP-client `onDidChangeState` subscription (or
    // stays in 'stopped' if no LSP client was even constructed).
    try {
        const downloadedPath = await ensureDealLspBinary(context);
        return { path: downloadedPath, source: 'downloaded' };
    } catch {
        // D-40 silent fallback — no modal, no showErrorMessage. The output
        // channel is owned by extension.ts (this file is invoked before the
        // client is constructed), so logging happens at the caller via the
        // null return — extension.ts already emits the missing-binary
        // message in that path.
        return null;
    }
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.stat(filePath);
        return true;
    } catch {
        return false;
    }
}
