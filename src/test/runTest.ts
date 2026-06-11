// runTest.ts — @vscode/test-electron entrypoint (kept for compatibility with
// direct invocation, e.g. `node out/test/runTest.js`). The default flow uses
// @vscode/test-cli's `vscode-test` binary configured via .vscode-test.mjs at
// the repo root — this file is the fallback for environments that haven't
// adopted the CLI yet (RESEARCH §5 lines 580–620).
//
// The runner downloads (or reuses a cached) VS Code, then launches it with:
//   * extensionDevelopmentPath = repo root (so vscode-deal is loaded as a dev ext)
//   * extensionTestsPath = ./suite (the mocha glue)
//   * launchArgs = [showcase workspace, --disable-extensions]

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    try {
        // __dirname after compile: <repo>/out/test
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Workspace under test: the canonical Phase-3 showcase project.
        const workspaceFolder = path.resolve(
            extensionDevelopmentPath,
            '../spec/examples/showcase'
        );

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [workspaceFolder, '--disable-extensions'],
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to run electron tests:', err);
        process.exit(1);
    }
}

void main();
