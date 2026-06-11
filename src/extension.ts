// extension.ts — VS Code activation entry point.
//
// Flow on activate():
//   1. Create the output channel ("DEAL Language Server") — one channel, shared
//      with the LanguageClient (client.ts passes it as `outputChannel`) so there
//      is never a duplicate entry in the Output dropdown.
//   2. Register commands ONCE, up front. They must exist even when no binary
//      resolves, because `deal.restartServer` is how the user recovers after
//      setting `deal.lsp.path` — it re-runs resolution (see startOrRestart).
//   3. Call startOrRestart() to resolve the binary, build the client, and start.
//
// startOrRestart() is the single code path for both initial activation and the
// restart command. It tears down any existing client/status-bar, re-resolves
// the binary (configured > bundled > download), and starts a fresh client. This
// is what makes a newly-set `deal.lsp.path` take effect without a window reload.
//
// D-40 silent-fallback policy: on any resolve/start failure we log and continue
// in TextMate-only mode — no modal — and the status bar surfaces the failure.
//
// activate() returns the LanguageClient handle inside an `exports` object so the
// electron integration tests can introspect client state.

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { resolveLspPath } from './binary';
import { createClient } from './client';
import { installStatusBar } from './status_bar';
import { registerCommands } from './commands';

export interface ActivationExports {
    client: LanguageClient | null;
    output: vscode.OutputChannel;
    statusBar: vscode.Disposable | null;
}

// Module-level live state so the restart command can rebuild the client.
let currentClient: LanguageClient | null = null;
let currentStatusBar: vscode.Disposable | null = null;

/**
 * Resolve the binary and (re)start the language client. Safe to call repeatedly:
 * it stops and disposes any prior client/status-bar first. Returns the new
 * client, or null if no binary resolved (TextMate-only fallback).
 */
async function startOrRestart(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel
): Promise<LanguageClient | null> {
    // Tear down the previous instance (restart path).
    if (currentStatusBar) {
        currentStatusBar.dispose();
        currentStatusBar = null;
    }
    if (currentClient) {
        try {
            await currentClient.stop();
        } catch (err) {
            output.appendLine(`deal-lsp stop failed (continuing): ${stringifyError(err)}`);
        }
        currentClient = null;
    }

    const binary = await resolveLspPath(context);
    if (binary === null) {
        output.appendLine(
            'deal-lsp binary not found (no deal.lsp.path, no bundled server/, ' +
                'and auto-download unavailable). Continuing in TextMate-only mode — ' +
                'set deal.lsp.path and run "DEAL: Restart Language Server" to enable ' +
                'LSP features.'
        );
        return null;
    }
    output.appendLine(`deal-lsp binary resolved via ${binary.source}: ${binary.path}`);

    const client = createClient(context, binary.path, output);
    currentClient = client;
    currentStatusBar = installStatusBar(client);

    try {
        await client.start();
    } catch (err) {
        // D-40 silent-fallback — no modal. The status bar already transitions to
        // the error state via the onDidChangeState subscription.
        output.appendLine(`deal-lsp start failed: ${stringifyError(err)}`);
    }
    return client;
}

export async function activate(
    context: vscode.ExtensionContext
): Promise<ActivationExports> {
    const output = vscode.window.createOutputChannel('DEAL Language Server');
    context.subscriptions.push(output);

    // Register commands first, unconditionally — restart must be available even
    // if the first resolution fails, since re-resolving is how the user recovers.
    registerCommands(context, output, () =>
        startOrRestart(context, output).then(() => undefined)
    );

    const client = await startOrRestart(context, output);
    return { client, output, statusBar: currentStatusBar };
}

export async function deactivate(): Promise<void> {
    if (currentStatusBar) {
        currentStatusBar.dispose();
        currentStatusBar = null;
    }
    if (currentClient) {
        try {
            await currentClient.stop();
        } catch {
            // best-effort on shutdown
        }
        currentClient = null;
    }
}

function stringifyError(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    }
    if (typeof err === 'string') {
        return err;
    }
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}
