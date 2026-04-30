import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Type definitions
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

interface Standards {
  security: RuleCategory;
  performance: RuleCategory;
  style: RuleCategory;
  best_practices: RuleCategory;
  languages?: Record<string, unknown>;
  global?: Record<string, unknown>;
}

interface CodeIssue {
  severity: 'high' | 'medium' | 'low';
  type: 'security' | 'performance' | 'style' | 'best-practice' | 'custom';
  location?: string;
  message: string;
  suggestion: string;
  example?: string;
  standardsReference?: string;
}

interface AnalysisResult {
  summary: string;
  issues: CodeIssue[];
  testCases?: string[];
  overallQuality: 'excellent' | 'good' | 'fair' | 'needs-improvement';
  positiveAspects?: string[];
  suggestedImprovements?: string[];
}

class StandardsRuleEngine {
  private standards: Standards;

  constructor(configPath: string) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    this.standards = yaml.load(configContent) as Standards;
  }

  /**
   * Load standards from YAML configuration
   */
  getStandards(): Standards {
    return this.standards;
  }

  /**
   * Get all enabled rules as a formatted string for the prompt
   */
  getEnabledRulesAsText(): string {
    const rules: string[] = [];

    // Security rules
    if (this.standards.security?.enabled) {
      rules.push('## Security Rules');
      const secRules = this.standards.security.rules;
      for (const [ruleName, rule] of Object.entries(secRules)) {
        if (typeof rule === 'object' && rule.enabled !== false) {
          rules.push(`- ${ruleName}: ${rule.description}`);
        }
      }
    }

    // Performance rules
    if (this.standards.performance?.enabled) {
      rules.push('\n## Performance Rules');
      const perfRules = this.standards.performance.rules;
      for (const [ruleName, rule] of Object.entries(perfRules)) {
        if (typeof rule === 'object' && rule.enabled !== false) {
          rules.push(`- ${ruleName}: ${rule.description}`);
        }
      }
    }

    // Style rules
    if (this.standards.style?.enabled) {
      rules.push('\n## Style & Maintainability Rules');
      const styleRules = this.standards.style.rules;
      for (const [ruleName, rule] of Object.entries(styleRules)) {
        if (typeof rule === 'object' && rule.enabled !== false) {
          rules.push(`- ${ruleName}: ${rule.description}`);
        }
      }
    }

    // Best practices
    if (this.standards.best_practices?.enabled) {
      rules.push('\n## Best Practices');
      const bpRules = this.standards.best_practices.rules;
      for (const [ruleName, rule] of Object.entries(bpRules)) {
        if (typeof rule === 'object' && rule.enabled !== false) {
          rules.push(`- ${ruleName}: ${rule.description}`);
        }
      }
    }

    return rules.join('\n');
  }

  /**
   * Build the prompt for Claude based on standards and code
   */
  buildPrompt(code: string, language: string = 'javascript'): string {
    const rulesText = this.getEnabledRulesAsText();

    return `You are an expert code reviewer. Your task is to analyze the following ${language} code and identify issues based on the standards below.

${rulesText}

IMPORTANT: Return your analysis as valid JSON matching this structure:
{
  "summary": "brief overview",
  "issues": [
    {
      "severity": "high|medium|low",
      "type": "security|performance|style|best-practice|custom",
      "location": "line or function name",
      "message": "what the issue is",
      "suggestion": "how to fix it",
      "example": "code example (optional)"
    }
  ],
  "testCases": ["test case 1", "test case 2"],
  "overallQuality": "excellent|good|fair|needs-improvement",
  "positiveAspects": ["what code does well"],
  "suggestedImprovements": ["optional suggestions"]
}

Code to review:
\`\`\`${language}
${code}
\`\`\`

Analyze this code thoroughly and return ONLY valid JSON, no other text.`;
  }
}

class AnalysisFormatter {
  /**
   * Parse Claude's JSON response
   */
  static parseAnalysis(jsonText: string): AnalysisResult {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const result = JSON.parse(jsonMatch[0]) as AnalysisResult;
      return result;
    } catch (error) {
      console.error('Failed to parse analysis:', error);
      throw new Error(`Invalid JSON response from Claude: ${error}`);
    }
  }

  /**
   * Format analysis result as readable text for PR comments
   */
  static formatForPRComment(analysis: AnalysisResult): string {
    let comment = '';

    // Header
    comment += `## 🔍 Code Review Analysis\n\n`;

    // Summary
    comment += `**Summary:** ${analysis.summary}\n\n`;

    // Issues
    if (analysis.issues.length > 0) {
      comment += `### Issues Found (${analysis.issues.length})\n\n`;

      // Group by severity
      const bySeverity = {
        high: analysis.issues.filter(i => i.severity === 'high'),
        medium: analysis.issues.filter(i => i.severity === 'medium'),
        low: analysis.issues.filter(i => i.severity === 'low'),
      };

      if (bySeverity.high.length > 0) {
        comment += `#### 🔴 High Severity\n`;
        bySeverity.high.forEach((issue, idx) => {
          comment += `${idx + 1}. **${issue.type}**: ${issue.message}\n`;
          comment += `   - Location: ${issue.location || 'N/A'}\n`;
          comment += `   - Fix: ${issue.suggestion}\n`;
          if (issue.example) {
            comment += `   - Example: \`${issue.example}\`\n`;
          }
          comment += '\n';
        });
      }

      if (bySeverity.medium.length > 0) {
        comment += `#### 🟡 Medium Severity\n`;
        bySeverity.medium.forEach((issue, idx) => {
          comment += `${idx + 1}. **${issue.type}**: ${issue.message}\n`;
          comment += `   - Suggestion: ${issue.suggestion}\n`;
          comment += '\n';
        });
      }

      if (bySeverity.low.length > 0) {
        comment += `#### 🟢 Low Severity\n`;
        bySeverity.low.forEach((issue, idx) => {
          comment += `${idx + 1}. **${issue.type}**: ${issue.message}\n`;
          comment += `   - Suggestion: ${issue.suggestion}\n`;
        });
      }
    } else {
      comment += `✅ No issues found!\n\n`;
    }

    // Positive aspects
    if (analysis.positiveAspects && analysis.positiveAspects.length > 0) {
      comment += `### ✨ What's Good\n`;
      analysis.positiveAspects.forEach(aspect => {
        comment += `- ${aspect}\n`;
      });
      comment += '\n';
    }

    // Test cases
    if (analysis.testCases && analysis.testCases.length > 0) {
      comment += `### 📋 Suggested Test Cases\n`;
      analysis.testCases.forEach(testCase => {
        comment += `- [ ] ${testCase}\n`;
      });
      comment += '\n';
    }

    // Overall quality
    comment += `### Overall Quality: **${analysis.overallQuality.toUpperCase()}**\n`;

    return comment;
  }

  /**
   * Output analysis as JSON
   */
  static formatAsJSON(analysis: AnalysisResult): string {
    return JSON.stringify(analysis, null, 2);
  }
}

export { StandardsRuleEngine, AnalysisFormatter, AnalysisResult, CodeIssue };