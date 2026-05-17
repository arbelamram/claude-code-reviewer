import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger.js';

// Action types a skill can perform. Git-level entries (file_*, branch_*,
// commit_pushed, pr_*) are the primary revert targets. commit_status_set
// is included because it gates PR mergeability and is directly reversible.
type ActionType =
  | 'file_created'
  | 'file_modified'
  | 'file_deleted'
  | 'branch_created'
  | 'branch_deleted'
  | 'commit_pushed'
  | 'pr_created'
  | 'pr_merged'
  | 'commit_status_set';

interface AuditEntry {
  type: ActionType;
  timestamp: string;
  details: Record<string, unknown>;
  // When true, revertInstructions tells Claude exactly how to undo this action.
  revertible: boolean;
  revertInstructions?: string;
}

interface AuditLog {
  skillName: string;
  runId: string;
  startedAt: string;
  repository: string;
  prNumber: number;
  entries: AuditEntry[];
}

// Subset of fs.promises needed by AuditLogger — injectable for testing.
type FileSystem = Pick<typeof fs.promises, 'writeFile' | 'appendFile'>;

interface AuditLoggerOptions {
  auditLogPath?: string;
  stepSummaryPath?: string;
  runId?: string;
  logger?: Logger;
  fileSystem?: FileSystem;
  now?: () => Date;           // injectable clock for deterministic tests
  secretPatterns?: RegExp[];  // additional patterns to redact beyond the built-in list
  // When non-empty, isSafePath also requires paths to start with one of these
  // prefixes. Provide the known-safe directories for the runtime environment
  // (e.g. ['/tmp/', runnerTemp + '/']) to guard against symlink attacks and
  // misconfigured env vars.
  allowedPathPrefixes?: string[];
}

// _CHARS suffix makes the unit explicit at the declaration site.
const MAX_DETAIL_VALUE_CHARS = 500;
const MAX_ERR_MESSAGE_CHARS  = 200;

/**
 * Records and persists a tamper-evident log of all repository-state actions
 * taken during a single code review run.
 *
 * Lifecycle: construct → record() (zero or more times) → flush() / flushStepSummary()
 * Not thread-safe — intended for single-threaded, single-run use within Node.js.
 * flush() and flushStepSummary() are each idempotent via promise memoization:
 * concurrent async callers receive the same Promise and the underlying write
 * executes exactly once.
 */
class AuditLogger {
  private readonly auditData: AuditLog;
  private readonly auditLogPath: string | undefined;
  private readonly stepSummaryPath: string | undefined;
  private readonly logger: Logger;
  private readonly fileSystem: FileSystem;
  private readonly now: () => Date;
  // Merged at construction so no per-call spread; caller patterns are cloned
  // via new RegExp(source, flags) to neutralise any external lastIndex state.
  private readonly allSecretPatterns: RegExp[];
  private readonly allowedPrefixes: string[];
  // Promise memoization — concurrent callers share the same Promise so the
  // write executes exactly once regardless of how many callers await it.
  private flushPromise: Promise<boolean> | undefined;
  private summaryPromise: Promise<boolean> | undefined;

  // Built-in patterns cover the most common CI secret formats.
  private static readonly SECRET_PATTERNS: RegExp[] = [
    /ghp_[a-zA-Z0-9]{36}/g,           // GitHub classic PAT
    /ghs_[a-zA-Z0-9]{36}/g,           // GitHub Actions token
    /github_pat_[a-zA-Z0-9_]{82}/g,   // GitHub fine-grained PAT
    /\bsk-[a-zA-Z0-9]{32,}\b/g,       // Anthropic / OpenAI-style API key (word-bounded to reduce false positives)
    /Bearer\s+\S{20,}/gi,             // generic Bearer token
  ];

  // Allowlist of detail keys permitted in audit entries. Fields outside this
  // set are dropped to prevent accidental PII / secret persistence.
  private static readonly SAFE_DETAIL_KEYS = new Set<string>([
    // repository context
    'owner', 'repo', 'prNumber',
    // commit / branch
    'headSha', 'commitSha', 'branchName',
    // commit status
    'state', 'description',
    // file operations
    'filePath', 'fileStatus',
    // issue / PR metadata
    'issueNumber', 'issueTitle',
  ]);

  constructor(
    repository: string,
    prNumber: number,
    options: AuditLoggerOptions = {}
  ) {
    const {
      auditLogPath,
      stepSummaryPath,
      runId              = 'local',
      logger             = new Logger(),
      fileSystem         = fs.promises,
      now                = () => new Date(),
      secretPatterns     = [],
      allowedPathPrefixes = [],
    } = options;

    this.auditLogPath    = auditLogPath;
    this.stepSummaryPath = stepSummaryPath;
    this.logger          = logger;
    this.fileSystem      = fileSystem;
    this.now             = now;
    this.allowedPrefixes = allowedPathPrefixes;
    this.allSecretPatterns = [
      ...AuditLogger.SECRET_PATTERNS,
      ...secretPatterns.map(p => new RegExp(p.source, p.flags)),
    ];
    this.auditData = {
      skillName: 'claude-code-reviewer',
      runId,
      startedAt: this.now().toISOString(),
      repository,
      prNumber,
      entries: [],
    };
  }

  record(
    type: ActionType,
    details: Record<string, unknown>,
    revertible = false,
    revertInstructions?: string
  ): void {
    this.auditData.entries.push({
      type,
      timestamp:  this.now().toISOString(),
      details:    this.cloneDetails(this.filterDetails(details)),
      revertible,
      revertInstructions,
    });
  }

  // Rejects paths with traversal components (e.g. /tmp/../etc/passwd).
  // When allowedPrefixes is set, also verifies the path starts with a known-safe
  // prefix, guarding against symlinks that resolve outside the expected directory.
  private isSafePath(p: string): boolean {
    if (!path.isAbsolute(p) || path.resolve(p) !== p) return false;
    if (this.allowedPrefixes.length > 0) {
      return this.allowedPrefixes.some(prefix => p.startsWith(prefix));
    }
    return true;
  }

  // Escapes characters that would break a markdown table cell or inject HTML.
  private sanitizeMd(value: string): string {
    return value
      .replace(/[\r\n]/g, ' ')
      .replace(/`/g, '&#96;')
      .replace(/\|/g, '\\|')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Applies all secret patterns to a single string. Resets lastIndex before
  // each replace so g-flag regex state never leaks between invocations.
  private redactString(value: string): string {
    let result = value;
    for (const pattern of this.allSecretPatterns) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  // Strips non-printable chars, file-system paths, and caps length so error
  // messages are safe to log without exposing sensitive path information.
  private safeErr(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return msg
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/(?:\/[\w.\-]+){2,}/g, '[path]')         // Unix-style paths
      .replace(/[A-Z]:\\(?:[\w.\-]+\\?)+/gi, '[path]')  // Windows-style paths
      .slice(0, MAX_ERR_MESSAGE_CHARS);
  }

  // Retains only allowlisted keys; warns with a count (not key names) when
  // fields are dropped to avoid leaking sensitive field names in logs.
  private filterDetails(details: Record<string, unknown>): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    let dropped = 0;
    for (const [k, v] of Object.entries(details)) {
      if (AuditLogger.SAFE_DETAIL_KEYS.has(k)) {
        filtered[k] = v;
      } else {
        dropped++;
      }
    }
    if (dropped > 0) {
      this.logger.warn(`Audit: ${dropped} field(s) excluded from details (not in allowlist)`);
    }
    return filtered;
  }

  // Tries structuredClone (handles circulars), then JSON round-trip (handles
  // non-cloneable primitives like Symbols), then falls back to shallow copy.
  // Risk ladder: JSON round-trip drops Date/undefined; shallow copy allows
  // mutation of nested objects. The warn log flags either degraded path.
  private cloneDetails(details: Record<string, unknown>): Record<string, unknown> {
    try {
      return structuredClone(details);
    } catch {
      try {
        return JSON.parse(JSON.stringify(details)) as Record<string, unknown>;
      } catch {
        this.logger.warn('Audit: falling back to shallow clone — nested objects are mutable');
        return { ...details };
      }
    }
  }

  // Bound arrow property so it can be passed directly to JSON.stringify without
  // an arrow wrapper in doFlush(), keeping this-binding unambiguous.
  private readonly secretReplacer = (_key: string, value: unknown): unknown => {
    return typeof value === 'string' ? this.redactString(value) : value;
  };

  // Writes the audit JSON to auditLogPath with restricted permissions (0o600)
  // so other processes on shared CI runners cannot read it.
  // Retrieve later via: gh run download <runId> -n code-reviewer-audit
  // Idempotent via promise memoization — concurrent callers share the same Promise.
  async flush(): Promise<boolean> {
    this.flushPromise = this.flushPromise ?? this.doFlush();
    return this.flushPromise;
  }

  // Appends the markdown audit summary to stepSummaryPath (if set and safe).
  // The summary is visible in the Actions UI under the workflow run.
  // Idempotent via promise memoization — concurrent callers share the same Promise.
  async flushStepSummary(): Promise<boolean> {
    this.summaryPromise = this.summaryPromise ?? this.doFlushStepSummary();
    return this.summaryPromise;
  }

  private async doFlush(): Promise<boolean> {
    const dest = this.auditLogPath;
    if (!dest || !this.isSafePath(dest)) return false;
    try {
      await this.fileSystem.writeFile(
        dest,
        JSON.stringify(this.auditData, this.secretReplacer, 2),
        { encoding: 'utf8', mode: 0o600 }
      );
      return true;
    } catch (err) {
      this.logger.error(`Audit log flush failed — data loss: ${this.safeErr(err)}`);
      return false;
    }
  }

  private async doFlushStepSummary(): Promise<boolean> {
    const dest = this.stepSummaryPath;
    if (!dest || !this.isSafePath(dest)) return false;
    try {
      await this.fileSystem.appendFile(dest, '\n\n' + this.toMarkdown(), 'utf8');
      return true;
    } catch (err) {
      this.logger.error(`Step summary flush failed: ${this.safeErr(err)}`);
      return false;
    }
  }

  private markdownHeader(): string[] {
    const { skillName, runId, startedAt, repository, prNumber } = this.auditData;
    const s = (v: string): string => this.sanitizeMd(v);
    return [
      `## 🗒️ ${skillName} — Audit Log`,
      '',
      '| Field | Value |',
      '|---|---|',
      `| Repository | \`${s(repository)}\` |`,
      `| PR | #${prNumber} |`,
      `| Run ID | \`${s(runId)}\` |`,
      `| Started | ${s(startedAt)} |`,
      '',
    ];
  }

  private markdownEntryLines(entry: AuditEntry): string[] {
    const s = (v: string): string => this.sanitizeMd(v);
    const icon = entry.revertible ? '↩️' : '📌';
    const lines = [
      `#### ${icon} \`${entry.type}\` — ${s(entry.timestamp)}`,
      '',
      '| Key | Value |',
      '|---|---|',
    ];
    for (const [k, v] of Object.entries(entry.details)) {
      // Defense-in-depth: skip keys not in the allowlist even though entry.details
      // was already filtered at record() time, so a future refactor cannot bypass
      // this path without also updating the allowlist.
      if (!AuditLogger.SAFE_DETAIL_KEYS.has(k)) continue;
      // Redact before truncating — truncating first could split a secret at the
      // boundary, leaving a partial token that bypasses pattern matching.
      const raw = this.redactString(JSON.stringify(v));
      const truncated = raw.length > MAX_DETAIL_VALUE_CHARS
        ? raw.slice(0, MAX_DETAIL_VALUE_CHARS) + '…'
        : raw;
      lines.push(`| ${s(k)} | \`${s(truncated)}\` |`);
    }
    if (entry.revertInstructions) {
      lines.push('', `**To revert:** ${s(entry.revertInstructions)}`);
    }
    lines.push('');
    return lines;
  }

  /** Renders the audit log as GitHub-flavoured markdown for step summaries. */
  toMarkdown(): string {
    const { entries } = this.auditData;
    const lines = this.markdownHeader();

    if (entries.length === 0) {
      lines.push(
        '_No tracked actions recorded during this run._',
        '',
        '> This skill run posted review comments and set a commit status.',
        '> To revert: delete the posted comments via the GitHub UI and',
        '> reset the commit status via the GitHub API if needed.',
      );
    } else {
      lines.push('### Actions taken', '');
      for (const entry of entries) {
        lines.push(...this.markdownEntryLines(entry));
      }
    }

    return lines.join('\n');
  }
}

export { AuditLogger };
export type { AuditLoggerOptions, AuditEntry, AuditLog, ActionType };
