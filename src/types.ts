export interface RecallConfig {
  enabled: boolean;
  maxResults: number;
  includePersona: boolean;
  includeScenarios: boolean;
  maxScenarios: number;
  maxContextChars: number;
}

export interface CaptureConfig {
  enabled: boolean;
  stripAssistantCodeBlocks: boolean;
}

export interface TlsConfig {
  rejectUnauthorized: boolean;
}

export interface MemoryConfig {
  endpoint: string;
  apiKey: string;
  serviceId: string;
  teamId: string;
  agentId: string;
  userId: string;
  taskId?: string;
  sessionPrefix: string;
  timeoutMs: number;
  tls: TlsConfig;
  recall: RecallConfig;
  capture: CaptureConfig;
}

export interface ConfigLoadResult {
  config: MemoryConfig;
  sources: string[];
  diagnostics: string[];
  missing: Array<"teamId" | "agentId" | "userId">;
  valid: boolean;
}

export interface AtomicMemory {
  id: string;
  type: string;
  content: string;
  score?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ScenarioEntry {
  path: string;
  summary?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CaptureMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface CaptureBatch {
  messages: CaptureMessage[];
  lastMessageEntryId?: string;
  hasSuccessfulAssistant: boolean;
}

export interface CursorData {
  lastMessageEntryId: string;
  capturedAt: string;
  remoteTotalCount?: number;
}
