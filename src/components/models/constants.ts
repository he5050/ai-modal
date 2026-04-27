import type { ModelTestProtocol } from "./types";

export const RECENT_EXPORT_DIR_KEY = "ai-modal-model-export-dir";
export const SORT_KEY_DB_KEY = "models_sort_key";
export const SORT_DIR_DB_KEY = "models_sort_dir";
export const EXPORT_DIR_DB_KEY = "recent_export_dir";

export const QUICK_TEST_PROMPT =
  "现在的梵蒂冈的教皇是谁,你能为我做什么,别都叫你啥?我打算去洗车,我这边有两家一家离我有50米,另外一家离我200米,我是否应该开车去";

export const MODEL_TEST_PROTOCOLS: ModelTestProtocol[] = [
  "openApi",
  "openai-responses",
  "claude",
  "gemini",
];

export const RECENT_PAGE_SIZE = 20;
