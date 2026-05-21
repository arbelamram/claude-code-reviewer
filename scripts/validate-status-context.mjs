/**
 * Validates that the STATUS_CONTEXT value in src/constants.ts matches every
 * hardcoded occurrence in the YAML workflow files that cannot import TypeScript.
 * Exits with code 1 on any mismatch so the build fails fast.
 */
import { readFileSync } from 'fs';

const constantsSource = readFileSync('src/constants.ts', 'utf-8');
// Match single-quoted, double-quoted, or backtick-quoted values
const match = constantsSource.match(/STATUS_CONTEXT\s*=\s*['"`]([^'"`]+)['"`]/);
if (!match) {
  console.error('❌ Could not locate STATUS_CONTEXT in src/constants.ts');
  process.exit(1);
}
const expected = match[1];
// Escape regex metacharacters so STATUS_CONTEXT is matched literally
const escapedExpected = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
console.log(`Checking STATUS_CONTEXT = '${expected}'`);

const yamlFiles = [
  '.github/workflows/code-review.yml',
  '.github/workflows/resolve-check.yml',
];

let failed = false;
for (const file of yamlFiles) {
  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch (err) {
    console.error(`❌ Could not read ${file}: ${err.message}`);
    failed = true;
    continue;
  }
  const hits = (content.match(new RegExp(`context: '${escapedExpected}'`, 'g')) ?? []).length;
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
