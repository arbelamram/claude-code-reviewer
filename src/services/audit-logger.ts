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
  auditLogPath?:    string;
  stepSummaryPath?: string;
  runId?:           string;
  logger?:          Logger;
  fileSystem?:      FileSystem;
}

const MAX_DETAIL_VALUE_LENGTH = 500;
const MAX_ERR_MESSAGE_LENGTH  = 200;

class AuditLogger {
  private readonly entries: AuditEntry[] = [];
  private readonly auditData: AuditLog;
  private readonly auditLogPath: string | undefined;
  private readonly stepSummaryPath: string | undefined;
  private readonly logger: Logger;
  private readonly fileSystem: FileSystem;

  constructor(
    repository: string,
    prNumber: number,
    options: AuditLoggerOptions = {}
  ) {
    const {
      auditLogPath,
      stepSummaryPath,
      runId      = 'local',
      logger     = new Logger(),
      fileSystem = fs.promises,
    } = options;

    this.auditLogPath    = auditLogPath;
    this.stepSummaryPath = stepSummaryPath;
    this.logger          = logger;
    this.fileSystem      = fileSystem;
    this.auditData = {
      skillName: 'claude-code-reviewer',
      runId,
      startedAt: new Date().toISOString(),
      repository,
      prNumber,
      entries:   this.entries,
    };
  }

  record(
    type: ActionType,
    details: Record<string, unknown>,
    revertible = false,
    revertInstructions?: string
  ): void {
    this.entries.push({
      type,
      timestamp: new Date().toISOString(),
      details: JSON.parse(JSON.stringify(details)) as Record<string, unknown>,
      revertible,
      revertInstructions,
    });
  }

  // Rejects paths with traversal components (e.g. /tmp/../etc/passwd).
  // path.resolve normalises the path; if the result differs, it contained "..".
  private isSafePath(p: string): boolean {
    return path.isAbsolute(p) && path.resolve(p) === p;
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

  // Strips non-printable chars and caps length so error messages are safe to log.
  private safeErr(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.replace(/[^\x20-\x7E]/g, '').slice(0, MAX_ERR_MESSAGE_LENGTH);
  }

  // Writes the audit JSON to auditLogPath (if set and safe).
  // The workflow uploads this file as a GitHub Actions artifact so Claude
  // can retrieve it later via: gh run download <runId> -n code-reviewer-audit
  async flush(): Promise<boolean> {
    const dest = this.auditLogPath;
    if (!dest || !this.isSafePath(dest)) return false;
    try {
      await this.fileSystem.writeFile(dest, JSON.stringify(this.auditData, null, 2), 'utf8');
      return true;
    } catch (err) {
      this.logger.warn(`Audit log flush failed: ${this.safeErr(err)}`);
      return false;
    }
  }

  // Appends the markdown audit summary to stepSummaryPath (if set and safe).
  // The summary is visible in the Actions UI under the workflow run.
  async flushStepSummary(): Promise<boolean> {
    const dest = this.stepSummaryPath;
    if (!dest || !this.isSafePath(dest)) return false;
    try {
      await this.fileSystem.appendFile(dest, '\n\n' + this.toMarkdown(), 'utf8');
      return true;
    } catch (err) {
      this.logger.warn(`Step summary flush failed: ${this.safeErr(err)}`);
      return false;
    }
  }

  toMarkdown(): string {
    const { skillName, runId, startedAt, repository, prNumber, entries } = this.auditData;
    const s = (v: string): string => this.sanitizeMd(v);

    const lines = [
      `## 🗒️ ${skillName} — Audit Log`,
      '',
      `| Field | Value |`,
      `|---|---|`,
      `| Repository | \`${s(repository)}\` |`,
      `| PR | #${prNumber} |`,
      `| Run ID | \`${s(runId)}\` |`,
      `| Started | ${s(startedAt)} |`,
      '',
    ];

    if (entries.length === 0) {
      lines.push('_No tracked actions recorded during this run._');
      lines.push('');
      lines.push('> This skill run posted review comments and set a commit status.');
      lines.push('> To revert: delete the posted comments via the GitHub UI and');
      lines.push('> reset the commit status via the GitHub API if needed.');
    } else {
      lines.push('### Actions taken', '');
      for (const entry of entries) {
        const icon = entry.revertible ? '↩️' : '📌';
        lines.push(`#### ${icon} \`${entry.type}\` — ${s(entry.timestamp)}`, '');
        lines.push('| Key | Value |');
        lines.push('|---|---|');
        for (const [k, v] of Object.entries(entry.details)) {
          const raw = JSON.stringify(v);
          const truncated = raw.length > MAX_DETAIL_VALUE_LENGTH
            ? raw.slice(0, MAX_DETAIL_VALUE_LENGTH) + '…'
            : raw;
          lines.push(`| ${s(k)} | \`${s(truncated)}\` |`);
        }
        if (entry.revertInstructions) {
          lines.push('', `**To revert:** ${s(entry.revertInstructions)}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

export { AuditLogger, AuditLoggerOptions, AuditEntry, AuditLog, ActionType };
