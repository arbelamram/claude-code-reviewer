import * as fs from 'fs';
import * as yaml from 'js-yaml';

interface Rule {
  description: string;
  severity: 'high' | 'medium' | 'low';
  enabled?: boolean;
  config?: Record<string, unknown>;
}

interface RuleCategory {
  enabled: boolean;
  rules: Record<string, Rule | boolean>;
}

interface ReviewConfig {
  exclude_paths?: string[];
}

interface Standards {
  review_config?: ReviewConfig;
  security: RuleCategory;
  performance: RuleCategory;
  style: RuleCategory;
  best_practices: RuleCategory;
  languages?: Record<string, unknown>;
  global?: Record<string, unknown>;
}

class StandardsEngine {
  private standards: Standards | null = null;
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  /**
   * Load standards from YAML file
   */
  loadStandards(): void {
    try {
      const fileContent = fs.readFileSync(this.configPath, 'utf-8');
      this.standards = yaml.load(fileContent) as Standards;
      console.log('✅ Standards loaded successfully');
    } catch (error) {
      console.error('❌ Error loading standards:', error);
      throw error;
    }
  }

  /**
   * Return paths/globs that should be excluded from code review.
   * Supports exact names (LICENSE), prefix globs (CHANGELOG*), and
   * double-star extension globs (see standards.yaml review_config.exclude_paths).
   */
  getExcludePaths(): string[] {
    return this.standards?.review_config?.exclude_paths ?? [];
  }

  /**
   * Get currently loaded standards
   */
  getStandards(): Standards {
    if (!this.standards) {
      throw new Error('Standards not loaded. Call loadStandards() first.');
    }
    return this.standards;
  }

  /**
   * Get all enabled rules formatted as text
   */
  getEnabledRulesAsText(): string {
    if (!this.standards) {
      throw new Error('Standards not loaded');
    }

    const lines: string[] = [];

    // Security rules
    if (this.standards.security?.enabled) {
      lines.push('## SECURITY RULES');
      lines.push('');
      const rules = this.standards.security.rules;
      for (const [ruleName, ruleData] of Object.entries(rules)) {
        if (typeof ruleData === 'object' && ruleData !== null) {
          const rule = ruleData as Rule;
          lines.push(`- ${ruleName}`);
          lines.push(`  Description: ${rule.description}`);
          lines.push(`  Severity: ${rule.severity}`);
          lines.push('');
        }
      }
    }

    // Performance rules
    if (this.standards.performance?.enabled) {
      lines.push('## PERFORMANCE RULES');
      lines.push('');
      const rules = this.standards.performance.rules;
      for (const [ruleName, ruleData] of Object.entries(rules)) {
        if (typeof ruleData === 'object' && ruleData !== null) {
          const rule = ruleData as Rule;
          lines.push(`- ${ruleName}`);
          lines.push(`  Description: ${rule.description}`);
          lines.push(`  Severity: ${rule.severity}`);
          lines.push('');
        }
      }
    }

    // Style rules
    if (this.standards.style?.enabled) {
      lines.push('## STYLE RULES');
      lines.push('');
      const rules = this.standards.style.rules;
      for (const [ruleName, ruleData] of Object.entries(rules)) {
        if (typeof ruleData === 'object' && ruleData !== null) {
          const rule = ruleData as Rule;
          lines.push(`- ${ruleName}`);
          lines.push(`  Description: ${rule.description}`);
          lines.push(`  Severity: ${rule.severity}`);
          lines.push('');
        }
      }
    }

    // Best practices
    if (this.standards.best_practices?.enabled) {
      lines.push('## BEST PRACTICES');
      lines.push('');
      const rules = this.standards.best_practices.rules;
      for (const [ruleName, ruleData] of Object.entries(rules)) {
        if (typeof ruleData === 'object' && ruleData !== null) {
          const rule = ruleData as Rule;
          lines.push(`- ${ruleName}`);
          lines.push(`  Description: ${rule.description}`);
          lines.push(`  Severity: ${rule.severity}`);
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Build the prompt for Claude
   */
  buildPrompt(codeToReview: string, language: string = 'javascript'): string {
    if (!this.standards) {
      throw new Error('Standards not loaded');
    }

    const rulesText = this.getEnabledRulesAsText();

    return `You are an expert code reviewer. Analyze the following ${language} code against these standards:

${rulesText}

Return your analysis as JSON with this exact structure:
{
  "summary": "one sentence summary",
  "issues": [
    {
      "severity": "high|medium|low",
      "type": "security|performance|style|best-practice|custom",
      "location": "filepath:line_number (e.g., src/auth.ts:42 or src/auth.ts:40-45)",
      "message": "what is wrong",
      "suggestion": "how to fix it"
    }
  ],
  "testCases": ["test case 1"],
  "overallQuality": "excellent|good|fair|needs-improvement"
}

Code to review (each line is prefixed with its actual file line number, e.g. "L42+  code" means an added line at file line 42, "L42   code" means unchanged context at line 42, and "     -  code" means a removed line):
${codeToReview}

IMPORTANT:
- Use the "L<n>" prefix to determine the exact line number where the issue occurs.
- The "location" field is REQUIRED for every issue. Always populate it using the format: filepath:line_number (e.g. src/auth.ts:42) or filepath:startLine-endLine (e.g. src/auth.ts:40-45). Never omit it.
- Report the line number of the specific statement that is the problem, not a surrounding bracket or closing line.
- Only include an entry in "issues" if the code requires an actual change. Do NOT add observations, compliments, or notes that require no action — if you have nothing to flag, return an empty array.
- The "suggestion" field must describe a concrete code change. Never write "No change needed", "No action required", or any equivalent no-op phrase.

Return ONLY valid JSON, no other text.`;
  }

  /**
   * Count total number of enabled rules
   */
  countEnabledRules(): number {
    if (!this.standards) {
      throw new Error('Standards not loaded');
    }

    let count = 0;

    const categories = [
      this.standards.security,
      this.standards.performance,
      this.standards.style,
      this.standards.best_practices,
    ];

    for (const category of categories) {
      if (category?.enabled) {
        for (const rule of Object.values(category.rules)) {
          if (typeof rule === 'object' && rule !== null) {
            const r = rule as Rule;
            if (r.enabled !== false) {
              count++;
            }
          }
        }
      }
    }

    return count;
  }
}

export { StandardsEngine, Standards, Rule, RuleCategory };