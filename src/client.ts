// client.ts — pure factory that builds a vscode-languageclient/node LanguageClient
// for the deal-lsp server. Constructs ServerOptions + LanguageClientOptions per
// RESEARCH §5 and returns the LanguageClient instance without starting it (the
// caller — extension.ts — owns lifecycle so it can apply the D-40 silent-fallback
// policy around start failures).

import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

/**
 * Build a LanguageClient configured to spawn the deal-lsp binary via stdio.
 *
 * Document selector covers both `deal` (.deal) and `dealx` (.dealx) languages.
 * File-event sync watches all `deal.toml` manifests so the server can refresh
 * workspace metadata (PS-5 aliases live there) when the user edits the manifest.
 *
 * The returned client is NOT started. Call `client.start()` from the caller so
 * that start-time failures can be handled by the silent-fallback policy
 * (D-40 — no modals; surface failure through the status bar).
 */
export function createClient(
    _context: vscode.ExtensionContext,
    lspPath: string,
    outputChannel: vscode.OutputChannel
): LanguageClient {
    const serverOptions: ServerOptions = {
        run: {
            command: lspPath,
            args: [],
            transport: TransportKind.stdio,
        },
        debug: {
            command: lspPath,
            args: ['--log=debug'],
            transport: TransportKind.stdio,
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'deal' },
            { scheme: 'file', language: 'dealx' },
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/deal.toml'),
        },
        // Reuse the extension-owned channel rather than letting the client
        // create its own. Passing `outputChannelName` instead would spawn a
        // SECOND channel with the same display name ("DEAL Language Server"),
        // so the dropdown shows two identical entries and the activation logs
        // land in a different one than the LSP traffic. Sharing one channel
        // keeps all output in a single place.
        outputChannel,
    };

    return new LanguageClient(
        'deal',
        'DEAL Language Server',
        serverOptions,
        clientOptions
    );
}
