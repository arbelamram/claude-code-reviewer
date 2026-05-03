import fetch from 'node-fetch';

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
  
    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error('Claude API key is required');
      }
      this.apiKey = apiKey;
    }
  
    /**
     * Send a prompt to Claude and get analysis
     */
    async analyzeCode(prompt: string): Promise<string> {
      try {
        console.log('🔌 Connecting to Claude API...');
  
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 2048,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        });
  
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `Claude API error: ${response.status} - ${JSON.stringify(errorData)}`
          );
        }
  
        const data = (await response.json()) as ClaudeResponse;
  
        console.log('✅ Claude API response received');
        console.log(
          `📊 Tokens used: ${data.usage.input_tokens} input, ${data.usage.output_tokens} output\n`
        );
  
        // Extract text from response
        const textContent = data.content.find(c => c.type === 'text');
        if (!textContent) {
          throw new Error('No text content in Claude response');
        }
  
        return textContent.text;
      } catch (error) {
        console.error('❌ Error calling Claude API:', error);
        throw error;
      }
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