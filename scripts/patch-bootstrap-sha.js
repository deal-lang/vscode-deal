#!/usr/bin/env node
// patch-bootstrap-sha.js — invoked by .github/workflows/release.yml Job 3
// (package-vsix) to substitute real SHA-256 digests into bootstrap.ts's
// SHA256_MANIFEST before `vsce package` runs.
//
// Invocation: node vscode-deal/scripts/patch-bootstrap-sha.js <artifacts-dir>
//
// <artifacts-dir> contains subdirs deal-lsp-<triple>/ each with a single
// deal-lsp[.exe] binary (the download-artifact step's layout). For each
// of the 5 supported triples, this script:
//   1. Computes SHA-256 of artifacts/deal-lsp-<triple>/deal-lsp[.exe] via
//      Node's crypto module (streaming, no in-memory load of large bins).
//   2. Replaces the corresponding `'<triple>': '<placeholder>'` entry in
//      vscode-deal/src/bootstrap.ts with `'<triple>': '<real-sha>'`.
//   3. Validates that ALL 5 placeholders were replaced — exits 1 if not
//      (defensive: a missing replacement would ship a .vsix that can
//      never SHA-verify the auto-downloaded binary, silently breaking
//      LSP for every user).
//
// The script is intentionally dependency-free (only Node stdlib) so it
// can run before `npm ci` would install bootstrap.ts's deps.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TRIPLES = [
    'darwin-arm64',
    'darwin-x64',
    'linux-x64-gnu',
    'linux-x64-musl',
    'win-x64',
];

const PLACEHOLDER = '<sha256-populated-by-CI-on-release-tag>';

function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

function binaryNameForTriple(triple) {
    return triple === 'win-x64' ? 'deal-lsp.exe' : 'deal-lsp';
}

function bootstrapPath() {
    // This script lives at vscode-deal/scripts/; bootstrap.ts is at
    // vscode-deal/src/bootstrap.ts. Resolve relative to __dirname.
    return path.join(__dirname, '..', 'src', 'bootstrap.ts');
}

async function main() {
    const artifactsDir = process.argv[2];
    if (!artifactsDir) {
        console.error(
            'Usage: node patch-bootstrap-sha.js <artifacts-dir>\n' +
            '       <artifacts-dir> contains deal-lsp-<triple>/ subdirs\n' +
            '       with the cross-built deal-lsp[.exe] binaries.'
        );
        process.exit(2);
    }
    if (!fs.existsSync(artifactsDir) || !fs.statSync(artifactsDir).isDirectory()) {
        console.error(`patch-bootstrap-sha: artifacts dir not found or not a dir: ${artifactsDir}`);
        process.exit(2);
    }

    const bootstrap = bootstrapPath();
    if (!fs.existsSync(bootstrap)) {
        console.error(`patch-bootstrap-sha: bootstrap.ts not found at ${bootstrap}`);
        process.exit(2);
    }

    let source = fs.readFileSync(bootstrap, 'utf8');
    let replacements = 0;

    for (const triple of TRIPLES) {
        const binaryName = binaryNameForTriple(triple);
        const binaryPath = path.join(artifactsDir, `deal-lsp-${triple}`, binaryName);
        if (!fs.existsSync(binaryPath)) {
            console.error(
                `patch-bootstrap-sha: missing artifact for ${triple} at ${binaryPath}`
            );
            process.exit(1);
        }
        const sha = await sha256File(binaryPath);
        const tripleKey = `'${triple}': '${PLACEHOLDER}'`;
        if (!source.includes(tripleKey)) {
            console.error(
                `patch-bootstrap-sha: placeholder for ${triple} not found in bootstrap.ts\n` +
                `  expected substring: ${tripleKey}`
            );
            process.exit(1);
        }
        source = source.replace(tripleKey, `'${triple}': '${sha}'`);
        replacements += 1;
        console.log(`  ${triple} -> ${sha}`);
    }

    if (replacements !== TRIPLES.length) {
        console.error(
            `patch-bootstrap-sha: expected ${TRIPLES.length} replacements, made ${replacements}`
        );
        process.exit(1);
    }

    // Sanity check: every SHA256_MANIFEST entry must now hold a real
    // 64-char hex digest (not the placeholder). One placeholder occurrence
    // is allowed in the doc-comment above the manifest (which describes
    // the pattern); that comment's substring is identical to the manifest
    // entries' substring, so we count remaining occurrences and assert
    // exactly one survives (the doc-comment) — anything else means a
    // TRIPLES entry was missed.
    const remaining = source.split(PLACEHOLDER).length - 1;
    if (remaining > 1) {
        console.error(
            `patch-bootstrap-sha: ${remaining} placeholder occurrences remain ` +
            `after replacement (expected 1 in the doc-comment). A SHA256_MANIFEST ` +
            `entry was missed — refusing to write a .vsix with unsubstituted hashes.`
        );
        process.exit(1);
    }

    fs.writeFileSync(bootstrap, source);
    console.log(`patch-bootstrap-sha: wrote ${bootstrap} (${replacements} hashes substituted)`);
}

main().catch((err) => {
    console.error(`patch-bootstrap-sha: fatal: ${err.stack || err}`);
    process.exit(1);
});
