import { CodeReviewOrchestrator } from './orchestrator.js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
  console.log('\n🚀 Claude Code Reviewer CLI\n');

  try {
    // Get environment variables
    const claudeApiKey = process.env.CLAUDE_API_KEY;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const prNumber = process.env.PR_NUMBER;

    // Validate required variables
    if (!claudeApiKey) {
      console.error('❌ Error: CLAUDE_API_KEY environment variable not set');
      process.exit(1);
    }

    if (!owner || !repo || !prNumber) {
      console.error('❌ Error: GITHUB_OWNER, GITHUB_REPO, and PR_NUMBER required');
      console.error(`  GITHUB_OWNER: ${owner || 'NOT SET'}`);
      console.error(`  GITHUB_REPO: ${repo || 'NOT SET'}`);
      console.error(`  PR_NUMBER: ${prNumber || 'NOT SET'}`);
      process.exit(1);
    }

    console.log('📋 Configuration:');
    console.log(`  Repository: ${owner}/${repo}`);
    console.log(`  PR Number: #${prNumber}`);
    console.log(`  Claude API: ✅ Configured\n`);

    // Initialize orchestrator
    const orchestrator = new CodeReviewOrchestrator(claudeApiKey);

    // Run code review
    await orchestrator.reviewPullRequest({
      owner,
      repo,
      prNumber: parseInt(prNumber, 10),
      claudeApiKey,
    });

    console.log('\n✨ Code review completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during code review:', error);
    process.exit(1);
  }
}

main();