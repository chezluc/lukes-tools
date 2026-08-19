export type ExecutionWorld = "ISOLATED" | "MAIN";

export type LogLevel = "log" | "warn" | "error";

export interface CapturedLog {
  level: LogLevel;
  args: unknown[];
  text: string;
  at: string;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

export interface RunResultEnvelope {
  ok: boolean;
  tabId?: number;
  url: string;
  durationMs: number;
  result: unknown;
  logs: CapturedLog[];
  error: SerializedError | null;
  ranAt: string;
  world: ExecutionWorld;
  executor?: "scripting" | "debugger" | "tabs";
  snippetName?: string;
  code: string;
}

export interface TabSummary {
  id: number;
  windowId: number;
  active: boolean;
  title: string;
  url: string;
  lastAccessed?: number;
}

export interface ExtensionState {
  currentUrl: string;
  history: RunResultEnvelope[];
}

export interface RunSnippetRequest {
  code: string;
  world: ExecutionWorld;
  snippetName?: string;
}

export interface BridgeRuntimeConfig {
  bridgeBaseUrl: string;
}
