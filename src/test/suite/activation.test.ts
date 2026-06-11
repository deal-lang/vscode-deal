// activation.test.ts — electron suite covering 3 behaviors (Issue 5 split:
// status_bar_transitions moved to src/test/unit/status.test.ts).
//
// 1. activates_on_deal_toml — workspace contains deal.toml; extension activates.
// 2. language_client_connects — LanguageClient reaches State.Running.
// 3. format_on_save_invokes_lsp — formatProvider round-trip via deal-lsp.
//
// Prerequisite: the deal-lsp binary must be reachable. Either:
//   * `deal.lsp.path` set in the showcase .vscode/settings.json (recommended —
//     runTest.ts can inject this dynamically pre-launch in CI), or
//   * `<repo>/server/deal-lsp` exists (the bundled-binary tier).
// Locally for dev: build with `cd ../deal && cargo build -p deal-lsp --release`
// and either set `deal.lsp.path` to the target path or symlink it into
// `<vscode-deal>/server/deal-lsp`.

import * as path from 'path';
import * as vscode from 'vscode';
import { expect } from 'chai';
import { State, LanguageClient } from 'vscode-languageclient/node';
import type { ActivationExports } from '../../extension';

const EXTENSION_ID = 'deal-lang.vscode-deal';

async function getExtensionExports(): Promise<ActivationExports> {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    expect(extension, `extension ${EXTENSION_ID} not found`).to.exist;
    const ext = extension!;
    if (!ext.isActive) {
        await ext.activate();
    }
    return ext.exports as ActivationExports;
}

async function waitForRunning(
    client: LanguageClient,
    timeoutMs = 10000
): Promise<State> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (client.state === State.Running) {
            return State.Running;
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    return client.state;
}

describe('vscode-deal activation', function () {
    this.timeout(30000);

    it('activates_on_deal_toml', async () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        expect(extension, `extension ${EXTENSION_ID} not found`).to.exist;
        await extension!.activate();
        expect(extension!.isActive).to.equal(true);
    });

    it('language_client_connects', async function () {
        const exp = await getExtensionExports();
        // If no LSP binary was resolvable, the test skips with a clear message
        // instead of failing — this differentiates wiring bugs from
        // environment-setup gaps (deal-lsp not built / not on PATH).
        if (exp.client === null) {
            this.skip();
        }
        const state = await waitForRunning(exp.client, 10000);
        expect(state).to.equal(State.Running);
    });

    it('format_on_save_invokes_lsp', async function () {
        const exp = await getExtensionExports();
        if (exp.client === null) {
            this.skip();
        }
        await waitForRunning(exp.client, 10000);

        // Use a known-stable showcase file. battery.deal is the same file the
        // deal-lsp golden tests exercise (Plan 04 SUMMARY metrics table).
        const workspaceFolders = vscode.workspace.workspaceFolders;
        expect(workspaceFolders, 'no workspace folder open').to.exist;
        const root = workspaceFolders![0].uri.fsPath;
        const fileUri = vscode.Uri.file(
            path.join(root, 'packages', 'vehicle', 'battery.deal')
        );

        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc);

        // Capture before-formatting state.
        const beforeFmt = doc.getText();

        // Insert a whitespace violation: append "  \n" at the end of line 0
        // (which is the @header line in showcase battery.deal). The
        // formatter should strip trailing whitespace.
        await editor.edit((edit) => {
            edit.insert(new vscode.Position(0, doc.lineAt(0).text.length), '   ');
        });
        const dirtyText = doc.getText();
        expect(dirtyText, 'edit did not apply').to.not.equal(beforeFmt);

        // Invoke the LSP formatter via the standard VS Code command.
        await vscode.commands.executeCommand('editor.action.formatDocument');

        const afterFmt = doc.getText();
        // The formatter should have removed our trailing spaces — afterFmt
        // should equal the original beforeFmt (the file was already formatted).
        expect(
            afterFmt,
            `format did not strip the injected trailing whitespace
              before: ${JSON.stringify(beforeFmt.slice(0, 80))}
              after:  ${JSON.stringify(afterFmt.slice(0, 80))}`
        ).to.equal(beforeFmt);
    });
});
