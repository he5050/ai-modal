import type { ModelResult } from "../../types";

export type ImportSummary = {
  valid: import("../../types").Provider[];
  invalidCount: number;
  duplicateInFileCount: number;
  duplicateExistingCount: number;
};

export type Filter = "all" | "available" | "untested";
export type SortKey = "name" | "time" | "available" | null;
export type SortDir = "asc" | "desc";

export type QuickTestProtocol = "openai" | "claude" | "gemini";
export type { ModelTestProtocol } from "../../lib/protocolUtils";

export type RowStatus = "pending" | "done";

export interface LiveResult extends ModelResult {
  status: RowStatus;
}

export type Phase = "idle" | "fetching" | "testing" | "done";
