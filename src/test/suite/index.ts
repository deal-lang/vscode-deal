// index.ts — Mocha runner glue for the electron suite. Discovers every
// `*.test.js` under `out/test/suite/` and runs them in a single mocha process
// inside the VS Code extension host.
//
// Loaded by @vscode/test-electron via runTest.ts -> extensionTestsPath.

import * as path from 'path';
import Mocha = require('mocha');
import { glob } from 'glob';

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'bdd',
        color: true,
        timeout: 20000,
    });

    const testsRoot = path.resolve(__dirname, '.');
    const files = await glob('**/*.test.js', { cwd: testsRoot });
    for (const file of files) {
        mocha.addFile(path.resolve(testsRoot, file));
    }

    await new Promise<void>((resolve, reject) => {
        try {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} electron test(s) failed`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}
