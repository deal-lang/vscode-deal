/**
 * TextMate grammar snapshot test harness.
 *
 * For each fixture in test/scope-cases/*.deal and *.dealx, we tokenize the file
 * with vscode-textmate + vscode-oniguruma (the same engine VS Code ships) and
 * emit a byte-stable JSON snapshot of {line, tokens: [{start, end, scopes}]}.
 *
 * On first run, missing snapshots are created. On subsequent runs, the actual
 * tokenization must equal the snapshot byte-for-byte. Set UPDATE_SNAPSHOTS=1
 * to regenerate.
 */
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as oniguruma from 'vscode-oniguruma';
import {
  Registry,
  parseRawGrammar,
  INITIAL,
  IGrammar,
  IRawGrammar,
} from 'vscode-textmate';

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT_DIR = path.join(__dirname, '__snapshots__');
const SCOPE_CASES_DIR = path.join(__dirname, 'scope-cases');

interface SnapshotLine {
  line: number;
  text: string;
  tokens: Array<{ start: number; end: number; scopes: string[] }>;
}

let grammarRegistry: Registry | null = null;

async function loadRegistry(): Promise<Registry> {
  if (grammarRegistry) return grammarRegistry;

  // Locate the WASM blob shipped by vscode-oniguruma
  const onigWasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
  const wasmBin = fs.readFileSync(onigWasmPath);
  await oniguruma.loadWASM(wasmBin);

  grammarRegistry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
      createOnigString: (str: string) => new oniguruma.OnigString(str),
    }),
    loadGrammar: async (scopeName: string): Promise<IRawGrammar | null> => {
      const map: Record<string, string> = {
        'source.deal':  path.join(ROOT, 'syntaxes', 'deal.tmLanguage.json'),
        'source.dealx': path.join(ROOT, 'syntaxes', 'dealx.tmLanguage.json'),
      };
      const filePath = map[scopeName];
      if (!filePath) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      return parseRawGrammar(raw, filePath);
    },
  });
  return grammarRegistry;
}

async function tokenizeFile(grammar: IGrammar, source: string): Promise<SnapshotLine[]> {
  const lines = source.split(/\r?\n/);
  // Drop trailing empty line caused by terminal newline
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  let ruleStack = INITIAL;
  const out: SnapshotLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const result = grammar.tokenizeLine(text, ruleStack);
    out.push({
      line: i + 1,
      text,
      tokens: result.tokens.map((t: { startIndex: number; endIndex: number; scopes: string[] }) => ({
        start: t.startIndex,
        end: t.endIndex,
        scopes: t.scopes.slice(),
      })),
    });
    ruleStack = result.ruleStack;
  }
  return out;
}

// Snapshot file paths are precomputed constants, not derived from input — this
// removes the dynamic `path.resolve(SNAPSHOT_DIR, <var>)` taint sink entirely
// (CWE-22 lint guard requires no caller-supplied input enters path APIs).
const SNAPSHOT_PATHS: Readonly<Record<string, string>> = Object.freeze({
  'element-keywords.deal':  path.join(SNAPSHOT_DIR, 'element-keywords.deal.snap.json'),
  'operators.deal':         path.join(SNAPSHOT_DIR, 'operators.deal.snap.json'),
  'annotations.deal':       path.join(SNAPSHOT_DIR, 'annotations.deal.snap.json'),
  'composition-tags.dealx': path.join(SNAPSHOT_DIR, 'composition-tags.dealx.snap.json'),
  'multiplicity.deal':      path.join(SNAPSHOT_DIR, 'multiplicity.deal.snap.json'),
});

const FIXTURE_PATHS: Readonly<Record<string, string>> = Object.freeze({
  'element-keywords.deal':  path.join(SCOPE_CASES_DIR, 'element-keywords.deal'),
  'operators.deal':         path.join(SCOPE_CASES_DIR, 'operators.deal'),
  'annotations.deal':       path.join(SCOPE_CASES_DIR, 'annotations.deal'),
  'composition-tags.dealx': path.join(SCOPE_CASES_DIR, 'composition-tags.dealx'),
  'multiplicity.deal':      path.join(SCOPE_CASES_DIR, 'multiplicity.deal'),
});

function snapshotPathFor(fixture: string): string {
  const p = SNAPSHOT_PATHS[fixture];
  if (!p) throw new Error(`no snapshot path registered for fixture: ${fixture}`);
  return p;
}

function fixturePathFor(fixture: string): string {
  const p = FIXTURE_PATHS[fixture];
  if (!p) throw new Error(`no fixture path registered for: ${fixture}`);
  return p;
}

function loadSnapshot(fixture: string): SnapshotLine[] | null {
  const p = snapshotPathFor(fixture);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeSnapshot(fixture: string, data: SnapshotLine[]): void {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(snapshotPathFor(fixture), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

describe('TextMate grammar snapshot tests', function () {
  this.timeout(15000);

  let registry: Registry;

  before(async () => {
    registry = await loadRegistry();
  });

  const fixtures: Array<{ name: string; scope: string }> = [
    { name: 'element-keywords.deal',  scope: 'source.deal'  },
    { name: 'operators.deal',         scope: 'source.deal'  },
    { name: 'annotations.deal',       scope: 'source.deal'  },
    { name: 'composition-tags.dealx', scope: 'source.dealx' },
    { name: 'multiplicity.deal',      scope: 'source.deal'  },
  ];

  for (const fixture of fixtures) {
    it(`tokenizes ${fixture.name} stably`, async () => {
      const grammar = await registry.loadGrammar(fixture.scope);
      if (!grammar) throw new Error(`failed to load grammar for ${fixture.scope}`);
      const source = fs.readFileSync(fixturePathFor(fixture.name), 'utf8');
      const actual = await tokenizeFile(grammar, source);

      const update = process.env.UPDATE_SNAPSHOTS === '1';
      const existing = loadSnapshot(fixture.name);
      if (existing === null || update) {
        writeSnapshot(fixture.name, actual);
        // First run / explicit update — informational pass.
        if (existing === null) {
          // eslint-disable-next-line no-console
          console.log(`  -> wrote new snapshot for ${fixture.name}`);
        }
        return;
      }

      expect(JSON.stringify(actual)).to.equal(JSON.stringify(existing));
    });
  }

  it('grammar contains every D-41 category scope (parity invariant)', async () => {
    const dealRaw  = fs.readFileSync(path.join(ROOT, 'syntaxes', 'deal.tmLanguage.json'),  'utf8');
    const dealxRaw = fs.readFileSync(path.join(ROOT, 'syntaxes', 'dealx.tmLanguage.json'), 'utf8');
    // Shared categories must appear in both grammars
    const sharedCategories = [
      'keyword.control.element.deal',
      'keyword.other.direction.deal',
      'storage.modifier.deal',
      'keyword.control.import.deal',
      'entity.name.type.reference.deal',
      'entity.name.namespace.deal',
      'keyword.operator.relationship.deal',
      'support.type.annotation.deal',
      'constant.numeric.multiplicity.deal',
      'comment.block.documentation.deal',
      'comment.line.double-slash.deal',
      'comment.block.deal',
      'string.quoted.double.deal',
      'constant.numeric.integer.deal',
      'punctuation.section.block.begin.deal',
      'punctuation.section.block.end.deal',
      'punctuation.definition.operator.begin.deal',
      'punctuation.definition.operator.end.deal',
    ];
    for (const scope of sharedCategories) {
      expect(dealRaw,  `deal grammar missing scope ${scope}`).to.contain(scope);
      expect(dealxRaw, `dealx grammar missing scope ${scope}`).to.contain(scope);
    }
    // dealx-only scope (composition tag)
    expect(dealxRaw, 'dealx grammar missing composition-tag scope').to.contain(
      'entity.other.attribute-name.composition.deal',
    );
    expect(dealxRaw, 'dealx grammar missing composition-tag punctuation').to.contain(
      'punctuation.definition.tag.begin.deal',
    );
  });
});
