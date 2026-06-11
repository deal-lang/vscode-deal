# DEAL Language — VS Code Extension

Editor support for [DEAL](https://deal-lang.org), the Digital Engineering Authoring Language, in VS Code and Cursor. Adds syntax highlighting, snippets, and language-server features for `.deal` (definitions) and `.dealx` (compositions) files.

## Features

Out of the box — no language server required:

- Syntax highlighting for `.deal` and `.dealx`, including `<<operator>>` relationships and `@annotation` styling
- Bracket matching and auto-close, including DEAL's `[< … >]` composition tags
- Comment toggling (`//`, `/* */`, `/** */`)
- A snippet library (`part def`, `requirement def`, `use case def`, and more)
- Distinct file icons for `.deal` and `.dealx`

With the DEAL language server (`deal-lsp`) available:

- Diagnostics, completion, hover, go-to-definition, document formatting, and workspace symbols

## Requirements

- VS Code `^1.95.0` (or a compatible Cursor build)
- For language-server features: the `deal-lsp` binary from the [`deal`](https://github.com/deal-lang/deal) repository. Put it on your `PATH`, or point the extension at it with the `deal.lsp.path` setting.

## Install

The extension is not on the Marketplace yet — build and install it from source:

```bash
git clone https://github.com/deal-lang/vscode-deal.git
cd vscode-deal
npm install
npm run compile
npx @vscode/vsce package          # produces vscode-deal-<version>.vsix
code --install-extension vscode-deal-*.vsix
```

To hack on the extension, open the folder in VS Code and press `F5` to launch an Extension Development Host.

## Settings

| Setting | Description |
|---------|-------------|
| `deal.lsp.path` | Path to the `deal-lsp` binary (defaults to a bundled binary / `PATH` lookup). |
| `deal.lsp.trace` | Trace LSP traffic between the editor and `deal-lsp` for debugging. |

## Commands

- **DEAL: Restart Language Server**
- **DEAL: Show Output**

## Development

```bash
npm run compile        # type-check + build to out/
npm run watch          # rebuild on change
npm run lint           # eslint
npm test               # extension integration tests
npm run test:grammars  # TextMate grammar tests
npm run test:unit      # unit tests
```

Syntax-highlighting color categories are documented in [`COLOR-CATEGORIES.md`](./COLOR-CATEGORIES.md).

## Documentation

Full language documentation, guides, and the language reference live at **[deal-lang.org](https://deal-lang.org)**.

## License

[Apache-2.0](./LICENSE).
