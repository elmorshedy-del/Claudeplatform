// Chat types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  cost?: number;
  tokensUsed?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  filesChanged?: FileChange[];
}

export interface FileChange {
  path: string;
  action: 'create' | 'edit' | 'delete';
  diff?: string;
}

// GitHub types
export interface RepoFile {
  path: string;
  content: string;
  sha: string;
}

export interface RepoTree {
  path: string;
  type: 'file' | 'dir';
  children?: RepoTree[];
}

export interface Branch {
  name: string;
  sha: string;
  isDefault: boolean;
}

// Settings types
export interface Settings {
  deployMode: 'safe' | 'direct';
  model: 'sonnet' | 'opus' | 'auto';
  enableMultiModelRouting: boolean;
  enableConversationCompression: boolean;
  tokenBudget: {
    enabled: boolean;
    perSession: number;
    perDay: number;
  };
  preBuiltCommands: boolean;
}

// Cost tracking
export interface CostTracker {
  sessionCost: number;
  dailyCost: number;
  monthlyCost: number;
  tokensUsed: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

// Railway types
export interface DeployStatus {
  status: 'building' | 'deploying' | 'success' | 'failed' | 'idle';
  url?: string;
  error?: string;
  logs?: string[];
}

// Session state
export interface Session {
  githubToken?: string;
  anthropicKey?: string;
  repo?: {
    owner: string;
    name: string;
    defaultBranch: string;
  };
  currentBranch?: string;
  railwayProjectId?: string;
  railwayToken?: string;
}
