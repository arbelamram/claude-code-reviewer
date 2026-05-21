/**
 * Validates that the STATUS_CONTEXT value in src/constants.ts matches every
 * hardcoded occurrence in the YAML workflow files that cannot import TypeScript.
 * Exits with code 1 on any mismatch so the build fails fast.
 */
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname, sep } from 'path';

// Resolve from this script's location so the script works regardless of cwd
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(root, 'package.json'))) {
  console.error(`❌ Unexpected project root: ${root} — no package.json found`);
  process.exit(1);
}

const constantsSource = readFileSync(join(root, 'src/constants.ts'), 'utf-8');
// Single-quote-only extraction matches the constraint documented in src/constants.ts.
const match = constantsSource.match(/STATUS_CONTEXT\s*=\s*'([^']+)'/);
if (!match) {
  console.error('❌ Could not locate STATUS_CONTEXT in src/constants.ts');
  process.exit(1);
}
const expected = match[1];
if (/['"]/.test(expected)) {
  console.error(`❌ STATUS_CONTEXT must not contain quote characters; got: ${expected}`);
  process.exit(1);
}
// Escape regex metacharacters so STATUS_CONTEXT is matched literally in YAML files
const escapedExpected = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
console.log(`Checking STATUS_CONTEXT = '${expected}'`);

const yamlRelPaths = [
  '.github/workflows/code-review.yml',
  '.github/workflows/resolve-check.yml',
];

const rootPrefix = root.endsWith(sep) ? root : root + sep;

let failed = false;
for (const rel of yamlRelPaths) {
  const file = join(root, rel);
  if (!file.startsWith(rootPrefix)) {
    console.error(`❌ Resolved path escapes project root: ${file}`);
    process.exit(1);
  }
  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch (err) {
    console.error(`❌ Could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    failed = true;
    continue;
  }
  const hits = (content.match(new RegExp(`context:\\s*['"]${escapedExpected}['"]`, 'g')) ?? []).length;
  if (hits === 0) {
    console.error(`❌ ${file}: no occurrence of \`context: '${expected}'\` — update to match STATUS_CONTEXT`);
    failed = true;
  } else {
    console.log(`✅ ${file}: ${hits} matching occurrence(s)`);
  }
}

if (failed) {
  console.error('\nSync check failed. Update the YAML files to match STATUS_CONTEXT in src/constants.ts.');
  process.exit(1);
}
console.log('✅ All YAML context strings match STATUS_CONTEXT');
