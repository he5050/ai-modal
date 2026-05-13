import { listModelsByProvider, testSingleModelByProvider } from "../../api";
import type { ModelResult } from "../../types";
import type { LiveResult } from "./types";

export interface DetectionRunnerStartPayload {
  models: string[];
  initialResults: LiveResult[];
  fromListApi: boolean;
}

export interface DetectionRunnerProgressPayload {
  done: number;
  total: number;
  model: string;
  result: LiveResult;
  liveResults: LiveResult[];
}

export interface DetectionRunnerOptions {
  baseUrl: string;
  apiKey: string;
  targetModels?: string[];
  concurrency: number;
  /** 要测试的协议，为空则不指定（走默认逻辑） */
  protocols?: string[];
  onStart?: (payload: DetectionRunnerStartPayload) => void;
  onProgress?: (payload: DetectionRunnerProgressPayload) => void;
}

export type DetectionRunnerResult =
  | {
      ok: true;
      models: string[];
      finalResults: LiveResult[];
      sortedResults: ModelResult[];
      availableCount: number;
    }
  | { ok: false; error: string };

function sortModelResults(results: LiveResult[]): LiveResult[] {
  return [...results].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return (a.latency_ms ?? 99999) - (b.latency_ms ?? 99999);
  });
}

function toModelResult(result: LiveResult): ModelResult {
  const { status: _status, ...rest } = result;
  return rest;
}

export async function runModelDetection(
  options: DetectionRunnerOptions,
): Promise<DetectionRunnerResult> {
  const baseUrl = options.baseUrl.trim();
  const apiKey = options.apiKey.trim();
  let models: string[];
  let fromListApi = false;

  if (options.targetModels && options.targetModels.length > 0) {
    models = options.targetModels;
  } else {
    try {
      models = await listModelsByProvider(baseUrl, apiKey);
      fromListApi = true;
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  const initialResults: LiveResult[] = models.map((model) => ({
    model,
    available: false,
    latency_ms: null,
    error: null,
    response_text: null,
    supported_protocols: [],
    protocol_results: [],
    status: "pending",
  }));
  options.onStart?.({ models, initialResults, fromListApi });

  const finalResults: LiveResult[] = [...initialResults];
  const queue = models.map((model, index) => ({ model, index }));
  const total = models.length;
  let done = 0;
  const workerCount = Math.max(1, Math.min(options.concurrency, total || 1));

  async function runNext(): Promise<void> {
    const item = queue.shift();
    if (!item) return;

    const { model, index } = item;
    try {
      // 传入 protocols 参数，为空则走默认逻辑
      const result = await testSingleModelByProvider(
        baseUrl,
        apiKey,
        model,
        options.protocols,
      );
      finalResults[index] = {
        ...result,
        protocol_results: result.protocol_results ?? [],
        status: "done",
      };
    } catch (error) {
      finalResults[index] = {
        model,
        available: false,
        latency_ms: null,
        error: String(error),
        response_text: String(error),
        supported_protocols: [],
        protocol_results: [],
        status: "done",
      };
    }

    done += 1;
    options.onProgress?.({
      done,
      total,
      model,
      result: finalResults[index],
      liveResults: [...finalResults],
    });
    await runNext();
  }

  await Promise.all(Array.from({ length: workerCount }, runNext));

  const sortedLiveResults = sortModelResults(finalResults);
  return {
    ok: true,
    models,
    finalResults: sortedLiveResults,
    sortedResults: sortedLiveResults.map(toModelResult),
    availableCount: sortedLiveResults.filter((item) => item.available).length,
  };
}
