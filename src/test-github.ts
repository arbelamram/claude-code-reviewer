import { GitHubConfigManager } from './github/github-config.js';

async function testGitHubConfig() {
  console.log('🧪 Testing GitHub Configuration\n');

  try {
    console.log('📝 Loading environment variables...');
    const configManager = new GitHubConfigManager();
    console.log('✅ Configuration loaded\n');

    const config = configManager.getConfig();
    console.log('GitHub Configuration:');
    console.log(`  Token: ${config.token ? '✅ Set (hidden)' : '❌ Not set'}`);
    console.log(`  Owner: ${config.owner || '⚠️  Not set'}`);
    console.log(`  Repo: ${config.repo || '⚠️  Not set'}`);
    console.log();

    const isComplete = configManager.isConfigComplete();
    console.log(`Configuration complete: ${isComplete ? '✅ Yes' : '⚠️  No'}`);

    if (isComplete) {
      console.log('\n🎉 GitHub integration ready!');
    } else {
      console.log('\n⚠️  Some configuration missing. GitHub integration may not work.');
      console.log('   Run: git clone https://github.com/arbelamram/test-repo');
      console.log('   Update .env with your GitHub credentials');
    }
  } catch (error) {
    console.error('❌ Error loading configuration:', error);
    process.exit(1);
  }
}

testGitHubConfig();