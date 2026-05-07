import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';

interface PRDiff {
  fileName: string;
  status: 'added' | 'removed' | 'modified';
  patch: string;
  additions: number;
  deletions: number;
}

interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  description: string;
  author: string;
  createdAt: string;
}

interface CommentOptions {
  owner: string;
  repo: string;
  prNumber: number;
  comment: string;
}

interface ReviewCommentInput {
  path: string;
  line: number;
  body: string;
}

interface ReviewOptions {
  owner: string;
  repo: string;
  prNumber: number;
  comments: ReviewCommentInput[];
  summary?: string;
}

class GitHubService {
  private octokit: Octokit;
  private token: string;

  constructor(githubToken: string) {
    this.token = githubToken;
    this.octokit = new Octokit({
      auth: githubToken,
      request: {
        fetch: fetch as any,
      },
    });
  }

  /**
   * Get the diff for a pull request (handles pagination for large PRs)
   */
  async getPRDiff(owner: string, repo: string, prNumber: number): Promise<PRDiff[]> {
    try {
      const files = await this.octokit.paginate(this.octokit.pulls.listFiles, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });

      return files.map(file => ({
        fileName: file.filename,
        status: file.status as 'added' | 'removed' | 'modified',
        patch: file.patch || '',
        additions: file.additions,
        deletions: file.deletions,
      }));
    } catch (error) {
      console.error('Error fetching PR diff:', error);
      throw error;
    }
  }

  /**
   * Get PR context information
   */
  async getPRContext(owner: string, repo: string, prNumber: number): Promise<PRContext> {
    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      return {
        owner,
        repo,
        prNumber,
        title: pr.title,
        description: pr.body || '',
        author: pr.user?.login || 'unknown',
        createdAt: pr.created_at,
      };
    } catch (error) {
      console.error('Error fetching PR context:', error);
      throw error;
    }
  }

  /**
   * Post a comment on a pull request
   */
  async postPRComment(options: CommentOptions): Promise<void> {
    try {
      await this.octokit.issues.createComment({
        owner: options.owner,
        repo: options.repo,
        issue_number: options.prNumber,
        body: options.comment,
      });
      console.log(`✅ Comment posted to PR #${options.prNumber}`);
    } catch (error) {
      console.error('Error posting comment:', error);
      throw error;
    }
  }

  /**
   * Post a pull request review with inline comments on specific lines
   */
  async postPRReview(options: ReviewOptions): Promise<void> {
    try {
      if (options.comments.length === 0) {
        console.log('ℹ️  No inline comments to post');
        return;
      }

      await this.octokit.pulls.createReview({
        owner: options.owner,
        repo: options.repo,
        pull_number: options.prNumber,
        event: 'COMMENT',
        body: options.summary || '📋 Inline code review comments below',
        comments: options.comments,
      });

      console.log(`✅ Review posted to PR #${options.prNumber} with ${options.comments.length} inline comment(s)`);
    } catch (error) {
      console.error('Error posting PR review:', error);
      throw error;
    }
  }

  /**
   * Verify token is valid by fetching authenticated user
   */
  async verifyToken(): Promise<boolean> {
    try {
      await this.octokit.users.getAuthenticated();
      return true;
    } catch (error) {
      console.error('Invalid GitHub token:', error);
      return false;
    }
  }

  /**
   * Get authenticated user information
   */
  async getAuthenticatedUser(): Promise<string> {
    try {
      const { data: user } = await this.octokit.users.getAuthenticated();
      return user.login;
    } catch (error) {
      console.error('Error getting authenticated user:', error);
      throw error;
    }
  }
}

export { GitHubService, PRDiff, PRContext, CommentOptions, ReviewCommentInput, ReviewOptions };