import { StandardsEngine } from '../services/standards-engine.js';
import { ClaudeService } from '../services/claude-service.js';
import { AnalysisFormatter } from '../formatters/analysis-formatter.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function testSkillWithCriticalErrors() {
  console.log('\n🧪 Testing Code Reviewer Skill with Critical Errors\n');

  try {
    // Load standards
    console.log('📋 Loading standards...');
    const standardsEngine = new StandardsEngine('./config/standards.yaml');
    standardsEngine.loadStandards();
    console.log('✅ Standards loaded\n');

    // Create focused test code with most critical issues
    const testCode = `
// Critical Security & Performance Issues for Testing

function getUserData(userId) {
  // SQL Injection - Critical
  const user = db.query("SELECT * FROM users WHERE id = " + userId);
  console.log("User query:", userId);
  return user;
}

function processPayment(cardNumber) {
  // Hardcoded secret - Critical
  const apiKey = "sk-abc123def456";
  // No error handling - Critical
  const response = fetch("https://api.example.com/pay", {
    body: JSON.stringify({ card: cardNumber, key: apiKey })
  });
  return response;
}

function searchUsers(email, users) {
  // O(n²) inefficient loop - Performance Issue
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < users.length; j++) {
      if (users[j].email === email) return users[j];
    }
  }
  return null;
}

function getData() {
  // Weak cryptography - Critical
  var hash = require('md5');
  var encrypted = hash('data');

  // Loose equality - Style
  if (encrypted == '123') {
    return true;
  }

  return false;
}

// Resource leak - Critical
function loadFile() {
  const file = fs.openSync('data.txt', 'r');
  const content = fs.readFileSync(file);
  // Missing: fs.closeSync(file);
  return content;
}

// Using var - Style Issue
function processData(data) {
  var x = 10;
  var y = 20;
  // Magic number without explanation
  if (data > 100) {
    return data * 1.5;
  }
  return data;
}

module.exports = { getUserData, processPayment, searchUsers, getData, loadFile, processData };
`;

    console.log('📝 Test code prepared with critical errors\n');

    // Build prompt
    console.log('🔨 Building analysis prompt...');
    const prompt = standardsEngine.buildPrompt(testCode, 'javascript');
    console.log(`✅ Prompt ready (${prompt.length} chars)\n`);

    // Send to Claude
    console.log('🤖 Sending to Claude API...');
    const claudeApiKey = process.env.CLAUDE_API_KEY;
    if (!claudeApiKey) {
      throw new Error('CLAUDE_API_KEY not set');
    }

    const claudeService = new ClaudeService(claudeApiKey);
    const response = await claudeService.analyzeCode(prompt);
    console.log('✅ Analysis received\n');

    // Parse response
    console.log('📊 Parsing response...');
    const analysis = AnalysisFormatter.parseAnalysis(response);
    console.log('✅ Response validated\n');

    // Display results
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    CODE REVIEW RESULTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`Summary: ${analysis.summary}\n`);

    const high = analysis.issues.filter(i => i.severity === 'high');
    const medium = analysis.issues.filter(i => i.severity === 'medium');
    const low = analysis.issues.filter(i => i.severity === 'low');

    console.log(`Issues: ${analysis.issues.length} total`);
    console.log(`  🔴 High: ${high.length} | 🟡 Medium: ${medium.length} | 🟢 Low: ${low.length}\n`);

    if (high.length > 0) {
      console.log('🔴 CRITICAL ISSUES:');
      high.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.type}] ${issue.message}`);
        console.log(`     → ${issue.suggestion}`);
      });
      console.log('');
    }

    if (medium.length > 0) {
      console.log('🟡 IMPORTANT ISSUES:');
      medium.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.type}] ${issue.message}`);
      });
      console.log('');
    }

    if (low.length > 0) {
      console.log('🟢 SUGGESTIONS:');
      low.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${issue.message}`);
      });
      console.log('');
    }

    console.log(`Overall Quality: ${analysis.overallQuality.toUpperCase()}\n`);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                   DETECTION VALIDATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Check if skill detected key issues
    const detectedIssues = {
      sqlInjection: high.some(i => i.message.toLowerCase().includes('sql')),
      hardcodedSecret: high.some(i => i.message.toLowerCase().includes('secret') || i.message.toLowerCase().includes('key')),
      inefficientLoop: medium.some(i => i.message.toLowerCase().includes('nested') || i.message.toLowerCase().includes('o(n²)')),
      weakCrypto: high.some(i => i.message.toLowerCase().includes('crypto') || i.message.toLowerCase().includes('md5')),
      resourceLeak: high.some(i => i.message.toLowerCase().includes('leak') || i.message.toLowerCase().includes('close')),
      varUsage: low.some(i => i.message.toLowerCase().includes('var')),
      looseEquality: low.some(i => i.message.toLowerCase().includes('===') || i.message.toLowerCase().includes('loose')),
      console: low.some(i => i.message.toLowerCase().includes('console'))
    };

    console.log('✅ KEY DETECTIONS:');
    Object.entries(detectedIssues).forEach(([key, detected]) => {
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
      console.log(`   ${detected ? '✓' : '✗'} ${label}`);
    });

    const detectionRate = Object.values(detectedIssues).filter(Boolean).length / Object.keys(detectedIssues).length;
    console.log(`\nDetection Rate: ${Math.round(detectionRate * 100)}%\n`);

    if (detectionRate >= 0.75) {
      console.log('✨ SKILL TEST PASSED - Excellent error detection! ✨\n');
    } else if (detectionRate >= 0.5) {
      console.log('⚠️  SKILL TEST PARTIAL - Good detection but some issues missed\n');
    } else {
      console.log('❌ SKILL TEST NEEDS IMPROVEMENT\n');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

testSkillWithCriticalErrors();
