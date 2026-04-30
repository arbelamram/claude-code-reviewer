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
   * Get the diff for a pull request
   */
  async getPRDiff(owner: string, repo: string, prNumber: number): Promise<PRDiff[]> {
    try {
      const { data: files } = await this.octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
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

export { GitHubService, PRDiff, PRContext, CommentOptions };