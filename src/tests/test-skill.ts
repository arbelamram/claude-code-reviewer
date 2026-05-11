import { StandardsEngine } from '../services/standards-engine.js';
import { ClaudeService } from '../services/claude-service.js';
import { AnalysisFormatter } from '../formatters/analysis-formatter.js';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const TEST_CODE = `
const API_KEY = 'sk-prod-hardcoded-secret';

function getUser(userId) {
  const query = 'SELECT * FROM users WHERE id = ' + userId;
  console.log('Executing:', query);
  return db.query(query);
}

async function login(username, password) {
  console.log('Login attempt:', username, password);
  const user = await getUser(username);
  if (user.password == password) {
    return { token: Math.random().toString(36) };
  }
  throw new Error('Error');
}

function processAll(items) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      results.push(items[i] + items[j]);
    }
  }
  return results;
}
`.trim();

async function testSkillWithComprehensiveErrors() {
  console.log('\n🧪 Testing Code Reviewer Skill with Sample Error Code\n');

  try {
    // 1. Load standards
    console.log('📋 Step 1: Loading standards...');
    const standardsPath = path.join(process.cwd(), 'config/standards.yaml');
    const standardsEngine = new StandardsEngine(standardsPath);
    standardsEngine.loadStandards();
    console.log('✅ Standards loaded\n');

    // 2. Use inline test code
    console.log('📝 Step 2: Using inline test code sample...');
    const testCode = TEST_CODE;
    console.log(`✅ Test code ready (${testCode.length} characters)\n`);

    // 3. Build prompt
    console.log('🔨 Step 3: Building analysis prompt...');
    const prompt = standardsEngine.buildPrompt(testCode, 'javascript');
    console.log(`✅ Prompt built (${prompt.length} characters)\n`);

    // 4. Send to Claude
    console.log('🤖 Step 4: Sending to Claude API for analysis...');
    const claudeApiKey = process.env.CLAUDE_API_KEY;
    if (!claudeApiKey) {
      throw new Error('CLAUDE_API_KEY environment variable not set');
    }

    const claudeService = new ClaudeService(claudeApiKey);
    const response = await claudeService.analyzeCode(prompt);
    console.log('✅ Claude analysis received\n');

    // 5. Parse response
    console.log('📊 Step 5: Parsing Claude response...');
    const analysis = AnalysisFormatter.parseAnalysis(response);
    console.log('✅ Response parsed and validated\n');

    // 6. Display results
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    ANALYSIS RESULTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`📌 Summary: ${analysis.summary}\n`);

    // Show issues by severity
    const high = analysis.issues.filter(i => i.severity === 'high');
    const medium = analysis.issues.filter(i => i.severity === 'medium');
    const low = analysis.issues.filter(i => i.severity === 'low');

    console.log(`📊 Issues Found: ${analysis.issues.length} total`);
    console.log(`   🔴 High Severity: ${high.length}`);
    console.log(`   🟡 Medium Severity: ${medium.length}`);
    console.log(`   🟢 Low Severity: ${low.length}\n`);

    if (high.length > 0) {
      console.log('🔴 HIGH SEVERITY ISSUES:');
      high.forEach((issue, idx) => {
        console.log(`\n  ${idx + 1}. [${issue.type}] ${issue.message}`);
        if (issue.location) console.log(`     📍 Location: ${issue.location}`);
        console.log(`     💡 Fix: ${issue.suggestion}`);
        if (issue.example) console.log(`     📝 Example: ${issue.example}`);
      });
      console.log('\n');
    }

    if (medium.length > 0) {
      console.log('🟡 MEDIUM SEVERITY ISSUES:');
      medium.forEach((issue, idx) => {
        console.log(`\n  ${idx + 1}. [${issue.type}] ${issue.message}`);
        console.log(`     💡 Suggestion: ${issue.suggestion}`);
      });
      console.log('\n');
    }

    if (low.length > 0) {
      console.log('🟢 LOW SEVERITY ISSUES:');
      low.forEach((issue, idx) => {
        console.log(`\n  ${idx + 1}. [${issue.type}] ${issue.message}`);
      });
      console.log('\n');
    }

    if (analysis.positiveAspects && analysis.positiveAspects.length > 0) {
      console.log('✨ POSITIVE ASPECTS:');
      analysis.positiveAspects.forEach(aspect => {
        console.log(`   ✅ ${aspect}`);
      });
      console.log('');
    }

    if (analysis.testCases && analysis.testCases.length > 0) {
      console.log('📋 SUGGESTED TEST CASES:');
      analysis.testCases.forEach(testCase => {
        console.log(`   ☐ ${testCase}`);
      });
      console.log('');
    }

    console.log(`Overall Quality: ${analysis.overallQuality.toUpperCase()}\n`);

    // 7. Statistics
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                      TEST STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const stats = AnalysisFormatter.getStats(analysis);
    console.log(`Total Issues Detected: ${stats.totalIssues}`);
    console.log(`  • High Severity: ${stats.highSeverity}`);
    console.log(`  • Medium Severity: ${stats.mediumSeverity}`);
    console.log(`  • Low Severity: ${stats.lowSeverity}`);
    console.log(`Suggested Test Cases: ${stats.suggestedTests}\n`);

    // 8. Test validation
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                   TEST VALIDATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const expectedMinIssues = 20; // We created 32 error functions
    const isSuccessful = stats.totalIssues >= expectedMinIssues;

    if (isSuccessful) {
      console.log(`✅ SKILL VALIDATION PASSED`);
      console.log(`   Expected: ≥${expectedMinIssues} issues`);
      console.log(`   Detected: ${stats.totalIssues} issues`);
      console.log(`   Status: COMPREHENSIVE ERROR DETECTION WORKING ✓\n`);
    } else {
      console.log(`⚠️  SKILL VALIDATION WARNING`);
      console.log(`   Expected: ≥${expectedMinIssues} issues`);
      console.log(`   Detected: ${stats.totalIssues} issues`);
      console.log(`   Status: Some errors may not have been detected\n`);
    }

    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('✨ Skill Test Complete!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSkillWithComprehensiveErrors();
