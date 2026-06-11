// status.ts — PURE-LOGIC status-bar state mapping.
//
// Issue 5 LOGIC SEAM: this module has ZERO imports from `vscode` and ZERO
// imports from `vscode-languageclient`. That invariant is enforced by the
// unit-suite verify gate (`! grep -q "from 'vscode'" src/status.ts` and
// `! grep -q "vscode-languageclient" src/status.ts`) and is what lets
// `npm run test:unit` run under pure mocha in ~1 second — no electron
// download, no xvfb. The thin VS Code wrapper lives in `status_bar.ts`,
// which imports updateStatusBar + fromLspState from this file.
//
// D-40 state machine (mapping per RESEARCH §5 lines 552–567):
//   State.Stopped  → text "$(error) DEAL LSP",        tooltip "DEAL LSP error — click for output"
//   State.Starting → text "$(sync~spin) DEAL LSP",    tooltip "DEAL LSP starting…"
//   State.Running  → text "$(check) DEAL LSP",        tooltip "DEAL LSP ready"

/** Normalized LSP lifecycle state (string-typed for testability). */
export type LspState = 'stopped' | 'starting' | 'running';

/** Plain data view applied to a VS Code StatusBarItem by status_bar.ts. */
export interface StatusBarView {
    text: string;
    tooltip: string;
}

/**
 * Map an `LspState` to the `{text, tooltip}` pair that drives the status bar.
 * Pure function — no side effects, no I/O, deterministic, exhaustive switch.
 */
export function updateStatusBar(state: LspState): StatusBarView {
    switch (state) {
        case 'starting':
            return {
                text: '$(sync~spin) DEAL LSP',
                tooltip: 'DEAL LSP starting…',
            };
        case 'running':
            return {
                text: '$(check) DEAL LSP',
                tooltip: 'DEAL LSP ready',
            };
        case 'stopped':
            return {
                text: '$(error) DEAL LSP',
                tooltip: 'DEAL LSP error — click for output',
            };
        default: {
            // Exhaustiveness guard — TypeScript narrows `state` to `never`.
            // If a new LspState variant is added without a case above, the
            // build breaks here at compile time.
            const _exhaustive: never = state;
            return { text: '$(error) DEAL LSP', tooltip: 'DEAL LSP error' };
        }
    }
}

/**
 * Convert vscode-languageclient's numeric `State` enum to the normalized
 * `LspState` union. Accepting a raw number (not the enum type) is intentional:
 * it avoids importing vscode-languageclient into this pure-logic module so
 * status.ts stays unit-testable without electron.
 *
 * vscode-languageclient State enum (from
 * microsoft/vscode-languageserver-node/client/src/common/client.ts):
 *   Stopped  = 1
 *   Running  = 2
 *   Starting = 3
 *
 * Any other value is mapped to 'stopped' (fail-safe — unknown state surfaces
 * the error indicator rather than stale 'ready').
 */
export function fromLspState(state: number): LspState {
    switch (state) {
        case 1:
            return 'stopped';
        case 2:
            return 'running';
        case 3:
            return 'starting';
        default:
            return 'stopped';
    }
}
