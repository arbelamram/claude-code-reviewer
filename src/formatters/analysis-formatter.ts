import * as fs from 'fs';
import * as path from 'path';

interface CodeIssue {
    severity: 'high' | 'medium' | 'low';
    type: 'security' | 'performance' | 'style' | 'best-practice' | 'custom';
    location?: string;
    message: string;
    suggestion: string;
    example?: string;
    standardsReference?: string;
  }

  interface ReviewComment {
    path: string;
    line: number;
    body: string;
  }

  interface AnalysisResult {
    summary: string;
    issues: CodeIssue[];
    testCases?: string[];
    overallQuality: 'excellent' | 'good' | 'fair' | 'needs-improvement';
    positiveAspects?: string[];
    suggestedImprovements?: string[];
  }

  class AnalysisFormatter {
    // Phrases that indicate Claude filled the issues array with a positive
    // observation rather than an actual finding. Matched against suggestion only
    // (the most reliable signal) without the g flag — .test() is stateless.
    private static readonly NO_OP_PATTERNS: RegExp[] = [
      /no\s+change\s+needed/i,
      /no\s+action\s+required/i,
      /no\s+action\s+needed/i,
      /no\s+issues?\s+(?:found|here)/i,
    ];

    private static isNoOpIssue(issue: { suggestion?: string }): boolean {
      const suggestion = issue.suggestion ?? '';
      return AnalysisFormatter.NO_OP_PATTERNS.some(p => p.test(suggestion));
    }

    /**
     * Validate analysis result has required fields and correct types
     */
    private static validateSchema(data: any): { valid: boolean; errors?: string[] } {
      const errors: string[] = [];

      if (typeof data !== 'object' || data === null) {
        return { valid: false, errors: ['Response is not a JSON object'] };
      }

      if (typeof data.summary !== 'string') {
        errors.push('summary: must be a string');
      }

      if (!Array.isArray(data.issues)) {
        errors.push('issues: must be an array');
      } else {
        data.issues.forEach((issue: any, idx: number) => {
          if (!['high', 'medium', 'low'].includes(issue.severity)) {
            errors.push(`issues[${idx}].severity: must be one of [high, medium, low]`);
          }
          if (!['security', 'performance', 'style', 'best-practice', 'custom'].includes(issue.type)) {
            errors.push(`issues[${idx}].type: must be one of [security, performance, style, best-practice, custom]`);
          }
          if (typeof issue.message !== 'string') {
            errors.push(`issues[${idx}].message: must be a string`);
          }
          if (typeof issue.suggestion !== 'string') {
            errors.push(`issues[${idx}].suggestion: must be a string`);
          }
        });
      }

      if (!['excellent', 'good', 'fair', 'needs-improvement'].includes(data.overallQuality)) {
        errors.push('overallQuality: must be one of [excellent, good, fair, needs-improvement]');
      }

      if (data.testCases && !Array.isArray(data.testCases)) {
        errors.push('testCases: must be an array');
      }

      if (data.positiveAspects && !Array.isArray(data.positiveAspects)) {
        errors.push('positiveAspects: must be an array');
      }

      return errors.length > 0 ? { valid: false, errors } : { valid: true };
    }

    /**
     * Parse JSON response from Claude with schema validation
     */
    static parseAnalysis(jsonText: string): AnalysisResult {
      try {
        // Try to extract JSON if it's surrounded by other text
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const result = JSON.parse(jsonMatch[0]);

        // Validate against schema
        const validation = this.validateSchema(result);
        if (!validation.valid) {
          const errorMessages = validation.errors?.join('\n') || 'Unknown error';
          console.warn('⚠️ Claude response validation warnings:');
          validation.errors?.forEach(err => console.warn(`   ${err}`));

          if (!result.summary || !result.overallQuality || !Array.isArray(result.issues)) {
            throw new Error(`Schema validation failed (missing required fields):\n${errorMessages}`);
          }
        } else {
          console.log('✅ Claude response validated against schema');
        }

        // Drop placeholder entries where Claude had nothing to flag but filled
        // the array anyway with a positive observation and a no-op suggestion.
        if (Array.isArray(result.issues)) {
          const before = result.issues.length;
          result.issues = result.issues.filter(
            (issue: { suggestion?: string }) => !AnalysisFormatter.isNoOpIssue(issue)
          );
          if (result.issues.length < before) {
            console.log(`ℹ️  Filtered ${before - result.issues.length} no-op issue(s) from response`);
          }
        }

        return result as AnalysisResult;
      } catch (error) {
        console.error('❌ Failed to parse analysis:', error);
        throw new Error(`Invalid JSON response: ${error}`);
      }
    }
  
    /**
     * Format analysis as readable GitHub PR comment
     */
    static formatForPRComment(analysis: AnalysisResult): string {
      let comment = '';
  
      // Header
      comment += '## 🔍 Code Review Analysis\n\n';
  
      // Summary
      comment += `**Summary:** ${analysis.summary}\n\n`;
  
      // Issues section
      if (analysis.issues.length > 0) {
        comment += `### Issues Found (${analysis.issues.length})\n\n`;
  
        // Separate by severity
        const high = analysis.issues.filter(i => i.severity === 'high');
        const medium = analysis.issues.filter(i => i.severity === 'medium');
        const low = analysis.issues.filter(i => i.severity === 'low');
  
        if (high.length > 0) {
          comment += '#### 🔴 High Severity\n';
          high.forEach((issue, idx) => {
            comment += `${idx + 1}. **${issue.type}**: ${issue.message}\n`;
            if (issue.location) comment += `   📍 Location: ${issue.location}\n`;
            comment += `   💡 Fix: ${issue.suggestion}\n`;
            if (issue.example) comment += `   📝 Example: \`${issue.example}\`\n`;
            comment += '\n';
          });
        }
  
        if (medium.length > 0) {
          comment += '#### 🟡 Medium Severity\n';
          medium.forEach((issue, idx) => {
            comment += `${idx + 1}. **${issue.type}**: ${issue.message}\n`;
            comment += `   💡 Suggestion: ${issue.suggestion}\n`;
            comment += '\n';
          });
        }
  
        if (low.length > 0) {
          comment += '#### 🟢 Low Severity\n';
          low.forEach((issue, idx) => {
            comment += `${idx + 1}. **${issue.type}**: ${issue.message}\n`;
          });
          comment += '\n';
        }
      } else {
        comment += '✅ **No issues found!**\n\n';
      }
  
      // Positive aspects
      if (analysis.positiveAspects && analysis.positiveAspects.length > 0) {
        comment += '### ✨ What\'s Good\n';
        analysis.positiveAspects.forEach(aspect => {
          comment += `- ${aspect}\n`;
        });
        comment += '\n';
      }
  
      // Test cases
      if (analysis.testCases && analysis.testCases.length > 0) {
        comment += '### 📋 Suggested Test Cases\n';
        analysis.testCases.forEach(testCase => {
          comment += `- [ ] ${testCase}\n`;
        });
        comment += '\n';
      }
  
      // Overall quality
      const qualityEmoji: Record<string, string> = {
        excellent: '⭐⭐⭐⭐⭐',
        good: '⭐⭐⭐⭐',
        fair: '⭐⭐⭐',
        'needs-improvement': '⭐⭐',
      };
      comment += `### Overall Quality: ${qualityEmoji[analysis.overallQuality]} ${analysis.overallQuality.toUpperCase()}\n`;
  
      return comment;
    }
  
    /**
     * Output analysis as formatted JSON
     */
    static formatAsJSON(analysis: AnalysisResult): string {
      return JSON.stringify(analysis, null, 2);
    }
  
    /**
     * Get summary stats about the analysis
     */
    static getStats(analysis: AnalysisResult): Record<string, number> {
      return {
        totalIssues: analysis.issues.length,
        highSeverity: analysis.issues.filter(i => i.severity === 'high').length,
        mediumSeverity: analysis.issues.filter(i => i.severity === 'medium').length,
        lowSeverity: analysis.issues.filter(i => i.severity === 'low').length,
        suggestedTests: analysis.testCases?.length || 0,
      };
    }

    /**
     * Parse location string (e.g., "src/auth.ts:42") to extract file and line
     */
    static parseLocation(location: string | undefined): { file: string; line: number } | null {
      if (!location) return null;

      const match = location.match(/^(.+?):(\d+)(?:-\d+)?$/);
      if (match) {
        return {
          file: match[1].trim(),
          line: parseInt(match[2], 10),
        };
      }
      return null;
    }

    /**
     * Convert analysis issues to GitHub review comments for inline diffs
     */
    static convertToReviewComments(analysis: AnalysisResult): ReviewComment[] {
      const comments: ReviewComment[] = [];

      for (const issue of analysis.issues) {
        const parsed = this.parseLocation(issue.location);
        if (parsed) {
          const severityEmoji: Record<string, string> = {
            high: '🔴',
            medium: '🟡',
            low: '🟢',
          };

          const body = `${severityEmoji[issue.severity]} **${issue.type}** (${issue.severity})\n\n${issue.message}\n\n💡 **Fix:** ${issue.suggestion}`;

          comments.push({
            path: parsed.file,
            line: parsed.line,
            body,
          });
          console.log(`📌 Parsed: ${issue.location} → ${parsed.file}:${parsed.line}`);
        } else if (issue.location) {
          console.warn(`⚠️  Could not parse location: "${issue.location}"`);
        }
      }

      console.log(`ℹ️  Converted ${comments.length} issues to inline review comments`);
      return comments;
    }
  }

  export { AnalysisFormatter, AnalysisResult, CodeIssue, ReviewComment };