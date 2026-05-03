import { ClaudeService } from './claude-service.js';
import { StandardsEngine } from './standards-engine.js';
import { AnalysisFormatter, type AnalysisResult } from './analysis-formatter.js';
import { GitHubService } from './github/github-service.js';
import { GitHubConfigManager } from './github/github-config.js';
import * as path from 'path';

interface ReviewOptions {
  owner: string;
  repo: string;
  prNumber: number;
  claudeApiKey: string;
}

class CodeReviewOrchestrator {
  private standardsEngine: StandardsEngine;
  private githubService: GitHubService;
  private configManager: GitHubConfigManager;
  private claudeApiKey: string;

  constructor(claudeApiKey: string) {
    const standardsPath = path.join(process.cwd(), 'config/standards.yaml');
    this.standardsEngine = new StandardsEngine(standardsPath);
    this.standardsEngine.loadStandards();

    this.configManager = new GitHubConfigManager();
    const githubToken = this.configManager.getToken();
    this.githubService = new GitHubService(githubToken);
    this.claudeApiKey = claudeApiKey;
  }

  /**
   * Main workflow: Review a GitHub PR
   */
  async reviewPullRequest(options: ReviewOptions): Promise<void> {
    console.log(`\n🚀 Starting Code Review for PR #${options.prNumber}`);
    console.log(`📍 Repository: ${options.owner}/${options.repo}\n`);

    try {
      // Step 1: Get PR context
      console.log('📋 Fetching PR information...');
      const prContext = await this.githubService.getPRContext(
        options.owner,
        options.repo,
        options.prNumber
      );
      console.log(`✅ PR Title: ${prContext.title}`);
      console.log(`✅ Author: @${prContext.author}\n`);

      // Step 2: Get PR diff
      console.log('📝 Fetching code changes...');
      const diffs = await this.githubService.getPRDiff(
        options.owner,
        options.repo,
        options.prNumber
      );
      console.log(`✅ Found ${diffs.length} files changed\n`);

      // Step 3: Combine code from all files
      console.log('🔨 Preparing code for analysis...');
      const combinedCode = this.prepareCombinedCode(diffs);
      console.log(`✅ Code prepared (${combinedCode.length} characters)\n`);

      // Step 4: Build prompt with standards
      console.log('📊 Building analysis prompt with standards...');
      const prompt = this.standardsEngine.buildPrompt(combinedCode, 'mixed');
      console.log(`✅ Prompt ready (${prompt.length} characters)\n`);

      // Step 5: Send to Claude
      console.log('🤖 Sending to Claude for analysis...');
      const claudeResponse = await this.callClaudeAPI(prompt);

      // Step 6: Parse response
      console.log('✅ Analysis complete\n');

      // Step 7: Create PR comment
      console.log('💬 Preparing PR comment...');
      const analysis = AnalysisFormatter.parseAnalysis(claudeResponse);

      const prComment = AnalysisFormatter.formatForPRComment(analysis);

      // Step 8: Post comment to GitHub
      console.log('📤 Posting comment to GitHub...');
      await this.githubService.postPRComment({
        owner: options.owner,
        repo: options.repo,
        prNumber: options.prNumber,
        comment: prComment,
      });

      console.log(`\n✨ Code review complete for PR #${options.prNumber}!`);
    } catch (error) {
      console.error('❌ Error during code review:', error);
      throw error;
    }
  }

  /**
   * Combine code from multiple files into a single string
   */
  private prepareCombinedCode(diffs: any[]): string {
    const sections = diffs.map(diff => {
      return `
\`\`\`
File: ${diff.fileName}
Status: ${diff.status}
Changes: +${diff.additions}/-${diff.deletions}
\`\`\`

${diff.patch || '(No patch content)'}
`;
    });

    return sections.join('\n\n---\n\n');
  }

  /**
   * Call Claude API (to be implemented)
   */
  private async callClaudeAPI(prompt: string): Promise<string> {
    const claude = new ClaudeService(this.claudeApiKey);
    return await claude.analyzeCode(prompt);
  }
}

export { CodeReviewOrchestrator, ReviewOptions };