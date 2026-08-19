import type { ExtensionState, RunResultEnvelope, RunSnippetRequest, TabSummary } from "./types";
import type { AIState } from "./ai-state";

export type BridgeRequest =
  | { type: "GET_STATE"; targetTabId?: number }
  | { type: "LIST_TABS" }
  | { type: "GET_AI_STATE"; targetTabId?: number }
  | { type: "OPEN_URL"; payload: { url: string; active?: boolean }; targetTabId?: number }
  | { type: "OPEN_TAB"; payload: { url: string; active?: boolean; waitMs?: number } }
  | { type: "CLOSE_TAB"; targetTabId: number }
  | { type: "RUN_SNIPPET"; payload: RunSnippetRequest; targetTabId?: number };

export type BridgeResponse =
  | { ok: true; state: ExtensionState }
  | { ok: true; tabs: TabSummary[] }
  | { ok: true; aiState: AIState }
  | { ok: true; run: RunResultEnvelope }
  | { ok: true }
  | { ok: false; error: string };
