// commands.ts — command-palette entries declared in package.json:
//   * deal.restartServer — RE-RESOLVE the binary and (re)start the LanguageClient.
//     Critical: this re-runs binary resolution, so it picks up a freshly-set
//     `deal.lsp.path` or a just-rebuilt local binary WITHOUT a full window
//     reload. (Previously it only called stop()/start() on an existing client,
//     so a path change set after a failed first activation never took effect.)
//   * deal.showOutput    — focus the LSP output channel. This is the D-40
//     diagnostic affordance — also the click target of the status-bar item.

import * as vscode from 'vscode';

export function registerCommands(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    restart: () => Promise<void>
): void {
    const restartCmd = vscode.commands.registerCommand(
        'deal.restartServer',
        async () => {
            output.appendLine('deal.restartServer: re-resolving binary and restarting…');
            try {
                await restart();
            } catch (err) {
                output.appendLine(
                    `deal.restartServer: restart failed: ${stringifyError(err)}`
                );
            }
        }
    );

    const showOutput = vscode.commands.registerCommand('deal.showOutput', () => {
        output.show(true);
    });

    context.subscriptions.push(restartCmd, showOutput);
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
