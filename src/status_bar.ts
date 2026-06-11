// status_bar.ts — thin VS Code integration layer for the LSP status bar.
//
// Owns the `vscode.StatusBarItem` and wires `client.onDidChangeState` to the
// pure-function `updateStatusBar(state)` in `./status`. All `text` + `tooltip`
// mapping logic lives in status.ts so it can be unit-tested in ~1s under pure
// mocha (Issue 5). This module exists solely to perform the VS Code-side I/O.

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { updateStatusBar, fromLspState, StatusBarView } from './status';

/**
 * Install the DEAL LSP status-bar item and subscribe to the LanguageClient's
 * state transitions. Returns the StatusBarItem (which implements Disposable);
 * the caller pushes it to `context.subscriptions` for cleanup on deactivate().
 */
export function installStatusBar(client: LanguageClient): vscode.Disposable {
    const item = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    // Clicking the item opens the LSP output channel — the D-40 affordance for
    // diagnosing why the LSP is starting/stopped/erroring.
    item.command = 'deal.showOutput';

    // Initial paint: client has been created but not yet started — show
    // "starting…" so the user sees activity immediately. The first real
    // onDidChangeState event (typically Stopped→Starting→Running) will
    // overwrite this within milliseconds.
    applyView(item, updateStatusBar('starting'));
    item.show();

    const subscription = client.onDidChangeState((event) => {
        applyView(item, updateStatusBar(fromLspState(event.newState)));
    });

    // Return a composite Disposable that tears down both the item and the
    // state subscription on extension deactivate.
    return {
        dispose: () => {
            subscription.dispose();
            item.dispose();
        },
    };
}

function applyView(item: vscode.StatusBarItem, view: StatusBarView): void {
    item.text = view.text;
    item.tooltip = view.tooltip;
}
