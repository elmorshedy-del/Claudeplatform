import Anthropic from '@anthropic-ai/sdk';
import { Message, FileChange, CostTracker } from '@/types';

// Pricing per million tokens (as of Dec 2024)
const PRICING = {
  'claude-sonnet-4-5-20250929': {
    input: 3.00,
    output: 15.00,
    cacheWrite: 3.75, // 25% more than input
    cacheRead: 0.30,  // 90% less than input
  },
  'claude-opus-4-5-20251101': {
    input: 15.00,
    output: 75.00,
    cacheWrite: 18.75,
    cacheRead: 1.50,
  },
};

type ModelKey = keyof typeof PRICING;

export class ClaudeClient {
  private client: Anthropic;
  private model: ModelKey;
  private costTracker: CostTracker;

  constructor(apiKey: string, model: ModelKey = 'claude-sonnet-4-5-20250929') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.costTracker = {
      sessionCost: 0,
      dailyCost: 0,
      monthlyCost: 0,
      tokensUsed: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
  }

  // Calculate cost from usage
  private calculateCost(usage: any): number {
    const pricing = PRICING[this.model];
    const inputCost = (usage.input_tokens || 0) * pricing.input / 1_000_000;
    const outputCost = (usage.output_tokens || 0) * pricing.output / 1_000_000;
    const cacheWriteCost = (usage.cache_creation_input_tokens || 0) * pricing.cacheWrite / 1_000_000;
    const cacheReadCost = (usage.cache_read_input_tokens || 0) * pricing.cacheRead / 1_000_000;
    
    return inputCost + outputCost + cacheWriteCost + cacheReadCost;
  }

  // Update cost tracker
  private updateCostTracker(usage: any): void {
    const cost = this.calculateCost(usage);
    this.costTracker.sessionCost += cost;
    this.costTracker.dailyCost += cost;
    this.costTracker.monthlyCost += cost;
    
    this.costTracker.tokensUsed.input += usage.input_tokens || 0;
    this.costTracker.tokensUsed.output += usage.output_tokens || 0;
    this.costTracker.tokensUsed.cacheRead += usage.cache_read_input_tokens || 0;
    this.costTracker.tokensUsed.cacheWrite += usage.cache_creation_input_tokens || 0;
  }

  getCostTracker(): CostTracker {
    return { ...this.costTracker };
  }

  resetSessionCost(): void {
    this.costTracker.sessionCost = 0;
    this.costTracker.tokensUsed = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }

  // Main chat function with prompt caching
  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    codeContext: string,
    tools?: any[]
  ): Promise<{
    content: string;
    toolCalls?: any[];
    usage: any;
    cost: number;
  }> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: [
        {
          type: 'text',
          text: systemPrompt,
        },
        {
          type: 'text',
          text: codeContext,
          // Enable caching for the code context
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      tools: tools || this.getDefaultTools(),
    });

    this.updateCostTracker(response.usage);

    // Extract text and tool calls
    let content = '';
    const toolCalls: any[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage,
      cost: this.calculateCost(response.usage),
    };
  }

  // Default tools for code editing
  private getDefaultTools() {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file from the repository',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file relative to repo root',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'str_replace',
        description: 'Replace a unique string in a file with another string. The old_str must appear exactly once in the file.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file to edit',
            },
            old_str: {
              type: 'string',
              description: 'The exact string to find and replace (must be unique in the file)',
            },
            new_str: {
              type: 'string',
              description: 'The string to replace it with',
            },
          },
          required: ['path', 'old_str', 'new_str'],
        },
      },
      {
        name: 'create_file',
        description: 'Create a new file with the given content',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path where the file should be created',
            },
            content: {
              type: 'string',
              description: 'The content of the new file',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'search_files',
        description: 'Search for files in the repository that contain a specific term',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search term to look for',
            },
          },
          required: ['query'],
        },
      },
    ];
  }
}

// System prompt for coding assistant
export const CODING_SYSTEM_PROMPT = `You are an expert software engineer helping with a codebase. You have access to tools to read and edit files.

IMPORTANT RULES:
1. Use str_replace for edits - never rewrite entire files
2. The old_str must be UNIQUE and EXACT (including whitespace)
3. If you need to see more files, use read_file
4. Always explain what you're doing before making changes
5. Make minimal, focused changes

WORKFLOW:
1. Analyze the request
2. Identify which files need to change
3. Request additional files if needed
4. Make changes using str_replace or create_file
5. Explain what was changed and why

If a str_replace fails because the string wasn't unique, try using a larger context string that includes more surrounding code.`;

// Generate context string from files
export function generateCodeContext(
  fileTree: string,
  files: Array<{ path: string; content: string }>
): string {
  let context = `## Repository Structure\n\`\`\`\n${fileTree}\n\`\`\`\n\n`;
  context += `## Loaded Files\n\n`;
  
  for (const file of files) {
    const ext = file.path.split('.').pop() || '';
    context += `### ${file.path}\n\`\`\`${ext}\n${file.content}\n\`\`\`\n\n`;
  }
  
  context += `\nIf you need to see other files, use the read_file tool.\n`;
  
  return context;
}

// Parse file changes from Claude's response
export function parseFileChanges(toolCalls: any[]): FileChange[] {
  const changes: FileChange[] = [];
  
  for (const call of toolCalls) {
    if (call.name === 'str_replace') {
      changes.push({
        path: call.input.path,
        action: 'edit',
        diff: `- ${call.input.old_str}\n+ ${call.input.new_str}`,
      });
    } else if (call.name === 'create_file') {
      changes.push({
        path: call.input.path,
        action: 'create',
      });
    }
  }
  
  return changes;
}
