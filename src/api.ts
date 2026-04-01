import { invoke } from "@tauri-apps/api/core"
import type { ModelResult } from "./types"

export async function listModels(baseUrl: string, apiKey: string): Promise<string[]> {
  return invoke("list_models", { baseUrl, apiKey })
}

export async function testModels(
  baseUrl: string,
  apiKey: string,
  models: string[]
): Promise<ModelResult[]> {
  return invoke("test_models", { baseUrl, apiKey, models })
}

export async function listModelsByProvider(
  baseUrl: string,
  apiKey: string
): Promise<string[]> {
  return invoke("list_models_by_provider", { baseUrl, apiKey })
}

export async function testModelsByProvider(
  baseUrl: string,
  apiKey: string,
  models: string[]
): Promise<ModelResult[]> {
  return invoke("test_models_by_provider", { baseUrl, apiKey, models })
}

export async function testSingleModelByProvider(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<ModelResult> {
  return invoke("test_single_model_by_provider", { baseUrl, apiKey, model })
}
