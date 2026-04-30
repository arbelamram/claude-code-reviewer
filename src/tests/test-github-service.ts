import { GitHubService } from '../github/github-service.js';
import { GitHubConfigManager } from '../github/github-config.js';

async function testGitHubService() {
  console.log('🧪 Testing GitHub Service Connection\n');

  try {
    // Load config
    console.log('📝 Loading GitHub configuration...');
    const configManager = new GitHubConfigManager();
    const token = configManager.getToken();
    console.log('✅ Configuration loaded\n');

    // Initialize service
    console.log('🔌 Initializing GitHub service...');
    const github = new GitHubService(token);
    console.log('✅ Service initialized\n');

    // Verify token
    console.log('🔐 Verifying GitHub token...');
    const isValid = await github.verifyToken();
    
    if (!isValid) {
      console.error('❌ Token is invalid');
      process.exit(1);
    }
    console.log('✅ Token is valid\n');

    // Get authenticated user
    console.log('👤 Fetching authenticated user...');
    const username = await github.getAuthenticatedUser();
    console.log(`✅ Logged in as: @${username}\n`);

    console.log('🎉 GitHub service is working correctly!');
    console.log(`\n✅ Ready to:
  - Read pull requests from ${configManager.getRepository().owner}/${configManager.getRepository().repo}
  - Post comments on PRs
  - Analyze code changes`);
  } catch (error) {
    console.error('❌ Error testing GitHub service:', error);
    process.exit(1);
  }
}

testGitHubService();