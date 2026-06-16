# Changelog

All notable changes to the **DEAL Language** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Snippets for the remaining element definitions, kept in sync with the
  language server's completion set: `calc def`, `allocation def`, `need def`,
  `use case def`, `actor def`.
- CI workflow (`.github/workflows/ci.yml`) running compile + lint + the
  pure-Node grammar and unit suites on every push/PR. (Electron-based
  activation/auto-download suites remain a follow-up.)

### Notes

- Hover now shows the SysML v2 metaclass, clause, and KerML basis for DEAL
  constructs — this comes from the bundled `deal-lsp` server; no extension
  change is required to benefit from it.

## [0.3.0] - 2026-06-11

Initial public release.

### Added

- Syntax highlighting for `.deal` (definitions) and `.dealx` (compositions), including `<<operator>>` relationships and `@annotation` styling.
- Bracket matching and auto-close, including DEAL's `[< … >]` composition tags.
- Comment toggling for `//`, `/* */`, and `/** */`.
- Snippet library for common constructs (`part def`, `requirement def`, `use case def`, and more).
- Distinct light/dark file icons for `.deal` and `.dealx`.
- Language-server client wiring for `deal-lsp`: diagnostics, completion, hover, go-to-definition, document formatting, and workspace symbols when the server is available.
- Commands: **DEAL: Restart Language Server** and **DEAL: Show Output**.
- Settings: `deal.lsp.path` and `deal.lsp.trace`.

[Unreleased]: https://github.com/deal-lang/vscode-deal/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/deal-lang/vscode-deal/releases/tag/v0.3.0
