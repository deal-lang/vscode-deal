# DEAL Color Categories — D-41 Parity Lookup Table

> **Decision anchor:** D-41 (visual parity by design) + D-38 (TextMate is the primary VS Code
> highlight surface, with LSP semantic-tokens overlay on top).
>
> This file is the canonical source-of-truth for the 20 color categories shared between
> the VS Code TextMate grammars (`syntaxes/{deal,dealx}.tmLanguage.json`) and the tree-sitter
> grammar's highlight queries (`tree-sitter-deal/queries/highlights.scm`, authored in Plan 02).
>
> **Why this exists:** Per D-41, both editor surfaces ship the same color category names so
> that a `.deal` file rendered in VS Code (TextMate) and the same file rendered in
> Neovim/Helix/Zed/GitHub-web (tree-sitter) get the same visual hierarchy. Themes that color
> any one of these scope/capture names automatically color all editor surfaces consistently.
>
> **How to add a category:** Add a row here FIRST, then update both
> `syntaxes/deal.tmLanguage.json` (and `dealx.tmLanguage.json` if applicable) AND
> `tree-sitter-deal/queries/highlights.scm`. Never let the three files drift.

## Category Table

| Category | TextMate scope | Tree-sitter capture |
|---|---|---|
| Element keyword (`part def`, `port def`, …) | `keyword.control.element.deal` | `@keyword.element` |
| Direction keyword (`in`, `out`, `inout`) | `keyword.other.direction.deal` | `@keyword.direction` |
| Modifier (`abstract`, `variation`) | `storage.modifier.deal` | `@keyword.modifier` |
| Import/package keyword | `keyword.control.import.deal` | `@keyword.import` |
| Definition name (declaration) | `entity.name.type.deal` | `@type.definition` |
| Definition reference | `entity.name.type.reference.deal` | `@type` |
| Namespace / package segment | `entity.name.namespace.deal` | `@namespace` |
| Relationship operator (`<<specializes>>` etc.) | `keyword.operator.relationship.deal` | `@operator.relationship` |
| Annotation category (`@trace`, `@simulation`) | `support.type.annotation.deal` | `@attribute.annotation` |
| Composition tag (`[<system>]`) | `entity.other.attribute-name.composition.deal` | `@tag.composition` |
| Multiplicity (`[1..*]`) | `constant.numeric.multiplicity.deal` | `@number.multiplicity` |
| Property declaration | `variable.other.property.deal` | `@property.declaration` |
| Property reference | `variable.other.property.reference.deal` | `@property` |
| Parameter | `variable.parameter.deal` | `@parameter` |
| Doc comment | `comment.block.documentation.deal` | `@comment.documentation` |
| Line comment | `comment.line.double-slash.deal` | `@comment` |
| Block comment | `comment.block.deal` | `@comment` |
| String literal | `string.quoted.double.deal` | `@string` |
| Integer literal | `constant.numeric.integer.deal` | `@number` |
| Punctuation (braces, brackets, angle-brackets) | `punctuation.definition.*.deal` | `@punctuation.bracket` / `@punctuation.delimiter` |

## Consumer Index

| Consumer | File | Notes |
|---|---|---|
| TextMate grammar — `.deal` | `syntaxes/deal.tmLanguage.json` | All scopes above except composition-tag |
| TextMate grammar — `.dealx` | `syntaxes/dealx.tmLanguage.json` | Inherits all + adds composition-tag |
| Tree-sitter grammar | `../tree-sitter-deal/queries/highlights.scm` (Plan 02) | Captures match the third column above |
| LSP semantic-tokens overlay | `../deal/lsp/src/semantic_tokens.rs` (Plan 04) | Refines TextMate baseline with type-aware tokens |

## Source

Derived verbatim from `.planning/phases/03-editor-intelligence/03-RESEARCH.md` §8 (Color
category names — D-41 parity).
