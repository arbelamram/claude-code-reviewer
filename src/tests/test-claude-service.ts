import { ClaudeService } from '../claude-service.js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function testClaudeService() {
  console.log('🧪 Testing Claude API Service\n');

  try {
    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      console.error(
        '❌ CLAUDE_API_KEY environment variable is not set'
      );
      console.log('\n📝 Steps to fix:');
      console.log('  1. Go to https://console.anthropic.com/account/keys');
      console.log('  2. Create or copy your API key');
      console.log('  3. Add to .env: CLAUDE_API_KEY=your_key_here');
      console.log('  4. Run this test again\n');
      process.exit(1);
    }

    console.log('🔧 Initializing Claude service...');
    const claude = new ClaudeService(apiKey);
    console.log('✅ Service initialized\n');

    console.log('🔐 Verifying API key...');
    const isValid = await claude.verifyApiKey();

    if (!isValid) {
      console.error('❌ API key verification failed');
      process.exit(1);
    }

    console.log('✅ API key is valid\n');

    console.log('🤖 Testing code analysis...');
    const testCode = `
function getUserData(userId) {
  const user = db.query("SELECT * FROM users WHERE id = " + userId);
  return user;
}
    `.trim();

    const testPrompt = `Analyze this code for security issues:

\`\`\`javascript
${testCode}
\`\`\`

Respond with a brief JSON analysis with: severity (high/medium/low), issue, and suggestion.`;

    const response = await claude.analyzeCode(testPrompt);
    console.log('✅ Analysis received\n');

    console.log('📊 Claude Response:');
    console.log('─'.repeat(50));
    console.log(response);
    console.log('─'.repeat(50));

    console.log('\n✨ Claude API service is working correctly!');
  } catch (error) {
    console.error('❌ Error testing Claude service:', error);
    process.exit(1);
  }
}

testClaudeService();