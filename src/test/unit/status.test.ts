// status.test.ts — pure-mocha unit suite for src/status.ts (Issue 5 logic seam).
//
// Runs WITHOUT @vscode/test-electron: no electron download, no xvfb, no LSP
// binary. Imports `status.ts` directly (which has zero vscode + zero
// vscode-languageclient imports — that's the invariant Issue 5 enforces).
//
// Expected runtime: ~1 second on any platform (vs ~30s for the electron suite).
//
// Coverage:
//   * updateStatusBar('starting' | 'running' | 'stopped') → exact {text, tooltip}
//     per the D-40 mapping table in RESEARCH §5 lines 552–567.
//   * fromLspState(1 | 2 | 3) → 'stopped' | 'starting' | 'running' (numeric
//     enum bridge to vscode-languageclient's State without importing it).

import { expect } from 'chai';
import { updateStatusBar, fromLspState, LspState } from '../../status';

describe('status_bar_transitions', () => {
    describe('updateStatusBar', () => {
        it('starting → spin icon + "starting…" tooltip', () => {
            const view = updateStatusBar('starting');
            expect(view.text).to.equal('$(sync~spin) DEAL LSP');
            expect(view.tooltip).to.equal('DEAL LSP starting…');
        });

        it('running → check icon + "ready" tooltip', () => {
            const view = updateStatusBar('running');
            expect(view.text).to.equal('$(check) DEAL LSP');
            expect(view.tooltip).to.equal('DEAL LSP ready');
        });

        it('stopped → error icon + "click for output" tooltip', () => {
            const view = updateStatusBar('stopped');
            expect(view.text).to.equal('$(error) DEAL LSP');
            expect(view.tooltip).to.equal('DEAL LSP error — click for output');
        });

        it('returns plain data (no vscode types)', () => {
            const view = updateStatusBar('running');
            // Type-level guarantee: only `text` and `tooltip` are observable.
            const keys = Object.keys(view).sort();
            expect(keys).to.deep.equal(['text', 'tooltip']);
        });
    });

    describe('fromLspState', () => {
        // vscode-languageclient State enum:
        //   Stopped  = 1
        //   Starting = 3
        //   Running  = 2
        // See https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/common/client.ts
        it('maps Stopped (1) → "stopped"', () => {
            expect(fromLspState(1)).to.equal('stopped');
        });

        it('maps Running (2) → "running"', () => {
            expect(fromLspState(2)).to.equal('running');
        });

        it('maps Starting (3) → "starting"', () => {
            expect(fromLspState(3)).to.equal('starting');
        });

        it('treats unknown enum values as "stopped" (fail-safe)', () => {
            // Defensive — unknown state is treated as "broken" so the status
            // bar shows the error indicator instead of stale "ready".
            expect(fromLspState(0)).to.equal('stopped');
            expect(fromLspState(99)).to.equal('stopped');
        });

        it('returned values type-narrow to LspState union', () => {
            const s: LspState = fromLspState(2);
            expect(['stopped', 'starting', 'running']).to.include(s);
        });
    });
});
