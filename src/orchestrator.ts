import { StandardsEngine } from './services/standards-engine.js';
import { AnalysisFormatter, type AnalysisResult } from './formatters/analysis-formatter.js';
import { GitHubService } from './services/github/github-service.js';
import { GitHubConfigManager } from './services/github/github-config.js';
import { ClaudeService } from './services/claude-service.js';
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
  private maxPromptTokens: number = 150000;
  private targetPromptTokens: number = 100000;

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
   * Estimate token count (rough: ~4 characters = 1 token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Validate and potentially truncate prompt to fit within token limits
   */
  private validatePromptSize(prompt: string, diffs: any[]): { prompt: string; truncated: boolean } {
    const estimatedTokens = this.estimateTokens(prompt);

    if (estimatedTokens <= this.targetPromptTokens) {
      console.log(`✅ Prompt size OK (${estimatedTokens} estimated tokens)`);
      return { prompt, truncated: false };
    }

    if (estimatedTokens > this.maxPromptTokens) {
      console.warn(`⚠️ Prompt exceeds max tokens (${estimatedTokens} > ${this.maxPromptTokens})`);
      console.log('🔪 Truncating code changes to fit context window...');

      let truncatedCode = '';
      let filesIncluded = 0;

      for (const diff of diffs) {
        const fileSection = `
\`\`\`
File: ${diff.fileName}
Status: ${diff.status}
Changes: +${diff.additions}/-${diff.deletions}
\`\`\`

${diff.patch || '(No patch content)'}
`;

        const testPrompt = this.standardsEngine.buildPrompt(
          truncatedCode + fileSection,
          'mixed'
        );
        const testTokens = this.estimateTokens(testPrompt);

        if (testTokens <= this.targetPromptTokens) {
          truncatedCode += fileSection + '\n\n---\n\n';
          filesIncluded++;
        } else {
          break;
        }
      }

      const newPrompt = this.standardsEngine.buildPrompt(truncatedCode, 'mixed');
      const newTokens = this.estimateTokens(newPrompt);

      console.warn(`⚠️ Included ${filesIncluded}/${diffs.length} files (${newTokens} tokens)`);

      if (filesIncluded === 0) {
        console.error('❌ Even the smallest file exceeds token limit');
        return { prompt, truncated: true };
      }

      return { prompt: newPrompt, truncated: true };
    }

    console.log(`✅ Prompt size OK (${estimatedTokens} estimated tokens)`);
    return { prompt, truncated: false };
  }

  /**
   * Main workflow: Review a GitHub PR
   */
  async reviewPullRequest(options: ReviewOptions): Promise<void> {
    console.log(`\n🚀 Starting Code Review for PR #${options.prNumber}`);
    console.log(`📍 Repository: ${options.owner}/${options.repo}\n`);

    try {
      // Step 1: Get PR information
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
      let prompt = this.standardsEngine.buildPrompt(combinedCode, 'mixed');
      console.log(`✅ Prompt ready (${prompt.length} characters)\n`);

      // Step 4.5: Validate prompt size
      console.log('📏 Validating prompt size...');
      const validation = this.validatePromptSize(prompt, diffs);
      prompt = validation.prompt;
      if (validation.truncated) {
        console.warn('⚠️ Note: Large PR was truncated to fit context window\n');
      }

      // Step 5: Send to Claude
      console.log('🤖 Sending to Claude for analysis...');
      const claudeResponse = await this.callClaudeAPI(prompt);

      // Step 6: Parse Claude's response
      console.log('✅ Analysis complete\n');

      // Step 7: Create PR comment
      console.log('💬 Preparing PR comment...');
      const analysis = AnalysisFormatter.parseAnalysis(claudeResponse);

      // Format for GitHub
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