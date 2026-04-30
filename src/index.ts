import { StandardsEngine } from './standards-engine.js';
import { AnalysisFormatter } from './analysis-formatter.js';
import * as path from 'path';

async function main() {
  console.log('🚀 Claude Code Reviewer Skill - Initialization Test\n');

  try {
    // Step 1: Load standards
    console.log('📋 Loading standards configuration...');
    const standardsPath = path.join(__dirname, '../config/standards.yaml');
    const engine = new StandardsEngine(standardsPath);
    engine.loadStandards();

    // Step 2: Count rules
    const ruleCount = engine.countEnabledRules();
    console.log(`✅ Loaded ${ruleCount} coding standards rules\n`);

    // Step 3: Display enabled rules
    console.log('📖 Sample of enabled rules:\n');
    const rulesText = engine.getEnabledRulesAsText();
    const rulesPreview = rulesText.split('\n').slice(0, 20).join('\n');
    console.log(rulesPreview);
    console.log('...\n');

    // Step 4: Build a sample prompt
    const sampleCode = `
function getUserData(userId) {
  const user = db.query("SELECT * FROM users WHERE id = " + userId);
  return user;
}
    `.trim();

    console.log('🔨 Building analysis prompt for sample code...');
    const prompt = engine.buildPrompt(sampleCode, 'javascript');
    console.log('✅ Prompt generated successfully\n');
    console.log('Prompt preview (first 300 chars):');
    console.log(prompt.substring(0, 300) + '...\n');

    // Step 5: Test formatter
    console.log('📊 Testing analysis formatter...');
    const sampleAnalysis = {
      summary: 'Code has a critical SQL injection vulnerability',
      issues: [
        {
          severity: 'high' as const,
          type: 'security' as const,
          location: 'Line 2',
          message: 'SQL injection vulnerability: user input concatenated directly into query',
          suggestion: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = ?", [userId])',
          example: 'db.query("SELECT * FROM users WHERE id = ?", [userId])',
        },
      ],
      testCases: ['Empty userId', 'Special characters in userId', 'SQL injection attempt'],
      overallQuality: 'needs-improvement' as const,
      positiveAspects: ['Function has clear purpose'],
    };

    const prComment = AnalysisFormatter.formatForPRComment(sampleAnalysis);
    console.log('✅ Formatter working correctly\n');
    console.log('Sample PR comment:\n');
    console.log(prComment);

    console.log('\n✨ All systems operational!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();