#!/usr/bin/env bash
# package-vsix.sh — build a self-contained DEAL VS Code extension (.vsix) with
# the deal-lsp binary bundled inside, so installing the .vsix "just works" with
# NO GitHub auto-download and NO manual deal.lsp.path. This is the tier-2
# "bundled binary" resolution path (binary.ts: <extension>/server/deal-lsp).
#
# Why bundling instead of the auto-download (tier-3) path:
#   The download tier fetches
#     github.com/deal-lang/deal/releases/download/v<VER>/deal-lsp-<triple>.tar.gz
#   and verifies it against SHA256_MANIFEST (patched by scripts/patch-bootstrap-sha.js
#   at package time). That requires the repo pushed + a published GitHub Release
#   with per-triple tarballs. Until those exist, bundling is the working path.
#
# IMPORTANT — single-platform output:
#   This bundles ONLY the host's binary, so the resulting .vsix runs only on the
#   build machine's OS/arch. For a multi-platform marketplace publish, build one
#   .vsix per target with platform-specific packaging, e.g.:
#     vsce package --target darwin-arm64   (after copying the arm64 binary)
#     vsce package --target linux-x64      (after copying the linux binary)
#   See: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platform-specific-extensions
#
# Usage:
#   cd vscode-deal && ./scripts/package-vsix.sh
#
# Output: vscode-deal/vscode-deal-<version>.vsix
set -euo pipefail

EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEAL_DIR="$(cd "$EXT_DIR/../deal" && pwd)"
SERVER_DIR="$EXT_DIR/server"
BIN_SRC="$DEAL_DIR/target/release/deal-lsp"
BIN_DST="$SERVER_DIR/deal-lsp"
SYMLINK_TARGET="../../deal/target/release/deal-lsp"  # dev symlink to restore after

echo "==> Building deal-lsp (release)…"
( cd "$DEAL_DIR" && cargo build -p deal-lsp --release )

if [[ ! -f "$BIN_SRC" ]]; then
  echo "ERROR: expected binary not found at $BIN_SRC" >&2
  exit 1
fi

echo "==> Compiling extension TypeScript…"
( cd "$EXT_DIR" && npm run compile )

echo "==> Bundling binary into server/ (real copy, not symlink)…"
mkdir -p "$SERVER_DIR"
rm -f "$BIN_DST"                 # remove the dev symlink (or stale copy)
cp "$BIN_SRC" "$BIN_DST"
chmod +x "$BIN_DST"

echo "==> Packaging .vsix…"
# --no-dependencies: deps are already vendored in node_modules; vsce just zips.
( cd "$EXT_DIR" && npx --yes @vscode/vsce package --no-dependencies )

echo "==> Restoring dev symlink (server/deal-lsp -> $SYMLINK_TARGET)…"
rm -f "$BIN_DST"
ln -sf "$SYMLINK_TARGET" "$BIN_DST"

echo "==> Done. Install with:  code --install-extension $EXT_DIR/vscode-deal-*.vsix"
