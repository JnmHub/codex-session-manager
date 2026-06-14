export type SessionMeta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  filePath: string;
  source?: string;
  originator?: string;
  cliVersion?: string;
  summary?: string;
};

export type SessionRecord = SessionMeta & {
  note?: string;
  tags: string[];
  archived: boolean;
  favorite: boolean;
  boundPath?: string;
  profile?: string;
  yolo?: boolean;
  launchArgs?: string[];
};

export type AppSettings = {
  globalProfile?: string;
  yoloDefault: boolean;
  llm: {
    enabled: boolean;
    provider: string;
    model: string;
    baseUrl: string;
    apiKeySource: 'codex-auth' | 'environment' | 'manual';
    apiKeyEnv?: string;
    manualApiKey?: string;
  };
};

export type ProfileRecord = {
  id: string;
  name: string;
  note?: string;
  commandArgs?: string;
  configPath?: string;
  markdownPath?: string;
  createdAt: string;
  updatedAt: string;
};

export type TranscriptMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
  text: string;
  timestamp?: string;
  source: 'original' | 'edited';
  line?: number;
};

export type LlmConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  actions?: Array<{
    tool: string;
    ok: boolean;
    summary: string;
    data?: unknown;
  }>;
};

export type LlmPermissionLevel = 'normal' | 'dangerous';

export type LlmConversation = {
  id: string;
  title: string;
  category?: string;
  pinned: boolean;
  order: number;
  maxContext: number;
  permissionLevel: LlmPermissionLevel;
  createdAt: string;
  updatedAt: string;
  messages: LlmConversationMessage[];
};

export type StoreData = {
  version: 2;
  updatedAt: string;
  sessions: Record<string, SessionRecord>;
  settings: AppSettings;
  profiles: Record<string, ProfileRecord>;
  transcriptEdits: Record<string, TranscriptMessage[]>;
  llmConversations: Record<string, LlmConversation>;
};

export type ListOptions = {
  all?: boolean;
  limit?: number;
  query?: string;
  project?: string;
};

export type LaunchOptions = {
  dryRun?: boolean;
  inline?: boolean;
  profile?: string;
  yolo?: boolean;
};
