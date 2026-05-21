interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string;
  }
  
  interface ClaudeResponse {
    content: Array<{
      type: string;
      text: string;
    }>;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  }
  
  class ClaudeService {
    private apiKey: string;
    private apiUrl: string = 'https://api.anthropic.com/v1/messages';
    private model: string = 'claude-opus-4-6';
    private maxRetries: number = 3;
    private requestTimeoutMs: number = 60000;

    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error('Claude API key is required');
      }
      this.apiKey = apiKey;
    }

    /**
     * Sleep for a given number of milliseconds
     */
    private sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Calculate exponential backoff delay
     */
    private getBackoffDelay(retryCount: number): number {
      const baseDelay = 1000;
      const delay = baseDelay * Math.pow(2, retryCount);
      const jitter = Math.random() * 1000;
      return delay + jitter;
    }

    /**
     * Check if error is retryable (transient)
     */
    private isRetryableError(status: number): boolean {
      return status === 429 || status >= 500;
    }

    /**
     * Send a prompt to Claude and get analysis with retry logic
     */
    async analyzeCode(prompt: string): Promise<string> {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          console.log(`🔌 Connecting to Claude API${attempt > 0 ? ` (attempt ${attempt + 1}/${this.maxRetries})` : ''}...`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

          try {
            const response = await fetch(this.apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: this.model,
                max_tokens: 4096,
                messages: [
                  {
                    role: 'user',
                    content: prompt,
                  },
                ],
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              const errorData = await response.json();
              const error = new Error(
                `Claude API error: ${response.status} - ${JSON.stringify(errorData)}`
              );

              if (this.isRetryableError(response.status) && attempt < this.maxRetries - 1) {
                console.warn(`⚠️ Transient error (${response.status}), retrying...`);
                lastError = error;
                const delay = this.getBackoffDelay(attempt);
                await this.sleep(delay);
                continue;
              }

              throw error;
            }

            const data = (await response.json()) as ClaudeResponse;

            console.log('✅ Claude API response received');
            console.log(
              `📊 Tokens used: ${data.usage.input_tokens} input, ${data.usage.output_tokens} output\n`
            );

            const textContent = data.content.find(c => c.type === 'text');
            if (!textContent) {
              throw new Error('No text content in Claude response');
            }

            return textContent.text;
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        } catch (error) {
          lastError = error as Error;

          if (error instanceof Error && error.message.includes('AbortError')) {
            console.warn('⚠️ Request timeout, retrying...');
            if (attempt < this.maxRetries - 1) {
              const delay = this.getBackoffDelay(attempt);
              await this.sleep(delay);
              continue;
            }
          }

          if (attempt === this.maxRetries - 1) {
            console.error('❌ Max retries exceeded. Error calling Claude API:', error);
            throw error;
          }
        }
      }

      throw lastError || new Error('Failed to call Claude API after max retries');
    }
  
    /**
     * Verify API key is valid
     */
    async verifyApiKey(): Promise<boolean> {
      try {
        const testPrompt = 'Respond with "OK"';
        await this.analyzeCode(testPrompt);
        return true;
      } catch (error) {
        console.error('Invalid Claude API key:', error);
        return false;
      }
    }
  }
  
  export { ClaudeService, ClaudeResponse, ClaudeMessage };