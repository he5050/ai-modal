import { describe, expect, it } from "vitest";
import {
  countMappingModels,
  getActiveMappingModels,
  getModelSlot,
  normalizeModelMappingConfig,
  providerToMappingProvider,
} from "../modelMapping";
import type { Provider } from "@/types";

describe("modelMapping", () => {
  it("imports only available tested models from existing providers", () => {
    const provider: Provider = {
      id: "provider-1",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api",
      apiKey: "secret",
      createdAt: 1,
      lastResult: {
        timestamp: 2,
        results: [
          {
            model: "available-model",
            available: true,
            latency_ms: 10,
            error: null,
            supported_protocols: ["openApi"],
          },
          { model: "failed-model", available: false, latency_ms: null, error: "no" },
        ],
      },
    };

    const imported = normalizeModelMappingConfig({
      providers: [providerToMappingProvider(provider)],
    }).providers[0];

    expect(imported.target_url).toBe("https://openrouter.ai/api");
    expect(imported.id).toBe("provider-1");
    expect(imported.models).toHaveLength(1);
    expect(imported.models[0]).toMatchObject({
      name: "available-model",
      slot: "",
      display_name: "OpenRouter-available-model",
      supported_protocols: ["openai-chat"],
      source_protocol: "openai-chat",
      target_protocol: "claude",
      to_1m: "",
      enabled: false,
    });
    expect(typeof imported.models[0].id).toBe("string");
  });

  it("fills missing slots with canonical defaults and preserves manual overrides", () => {
    const normalized = normalizeModelMappingConfig({
      providers: [
        {
          id: "custom",
          name: "Custom",
          target_url: "https://example.com/anthropic",
          api_key: "secret",
          models: [
            {
              name: "deepseek-v4-flash",
              supported_protocols: ["claude", "gemini"],
              source_protocol: "gemini",
              target_protocol: "claude",
              to_1m: "",
              enabled: true,
            },
            {
              name: "deepseek-v4-pro",
              slot: "anthropic/claude-sonnet-4-5",
              display_name: "Custom Plus",
              supported_protocols: ["claude", "openai-chat"],
              source_protocol: "claude",
              target_protocol: "claude",
              to_1m: "",
              enabled: true,
            },
            {
              name: "glm-5-turbo",
              supported_protocols: ["gemini"],
              to_1m: "",
              enabled: true,
            },
          ],
          thinking_effort: "",
        },
      ],
    });

    expect(normalized.providers[0].models[0].slot).toBe("");
    expect(normalized.providers[0].models[0].display_name).toBe("Custom-deepseek-v4-flash");
    expect(normalized.providers[0].models[0].source_protocol).toBe("gemini");
    expect(normalized.providers[0].models[0].target_protocol).toBe("claude");
    expect(normalized.providers[0].models[1].slot).toBe("anthropic/claude-sonnet-4-5");
    expect(normalized.providers[0].models[1].display_name).toBe("Custom Plus");
    expect(normalized.providers[0].models[2].slot).toBe("");
    expect(normalized.providers[0].models[2].display_name).toBe("Custom-glm-5-turbo");
    expect(normalized.providers[0].models[2].source_protocol).toBe("gemini");
    expect(normalized.providers[0].models[2].target_protocol).toBe("claude");
  });

  it("upgrades old auto-generated slots to canonical defaults", () => {
    const normalized = normalizeModelMappingConfig({
      providers: [
        {
          id: "custom",
          name: "Custom",
          target_url: "https://example.com/anthropic",
          api_key: "secret",
          models: [
            {
              name: "glm-5-turbo",
              slot: "anthropic/claude-glm-5-turbo",
              supported_protocols: ["gemini"],
              to_1m: "",
              enabled: true,
              protocol: "gemini",
            },
            {
              name: "kimi-k2.6",
              slot: "anthropic/claude-claude-kimi-k2.6",
              supported_protocols: ["openai-responses"],
              to_1m: "",
              enabled: true,
              protocol: "openai-responses",
            },
          ],
          thinking_effort: "",
        },
      ],
    });

    expect(normalized.providers[0].models[0].slot).toBe("");
    expect(normalized.providers[0].models[1].slot).toBe("");
    expect(normalized.providers[0].models[0].source_protocol).toBe("gemini");
    expect(normalized.providers[0].models[1].source_protocol).toBe("openai-responses");
  });

  it("fills missing display names with provider-model and preserves manual display name", () => {
    const normalized = normalizeModelMappingConfig({
      providers: [
        {
          id: "custom",
          name: "Iruidong",
          target_url: "https://example.com/anthropic",
          api_key: "secret",
          models: [
            {
              name: "claude-opus-4",
              supported_protocols: ["claude"],
              to_1m: "",
              enabled: true,
            },
            {
              name: "claude-sonnet-4-5",
              display_name: "My Sonnet Alias",
              supported_protocols: ["claude"],
              to_1m: "",
              enabled: true,
            },
          ],
          thinking_effort: "",
        },
      ],
    });

    expect(normalized.providers[0].models[0].display_name).toBe("Iruidong-claude-opus-4");
    expect(normalized.providers[0].models[1].display_name).toBe("My Sonnet Alias");
  });

  it("normalizes source and target protocols from legacy and explicit values", () => {
    const normalized = normalizeModelMappingConfig({
      providers: [
        {
          id: "legacy",
          name: "Legacy",
          target_url: "https://example.com/anthropic",
          api_key: "secret",
          models: [
            {
              name: "a",
              supported_protocols: ["gemini", "openai-responses"],
              protocol: "gemini",
              enabled: true,
              to_1m: "",
            },
            {
              name: "b",
              supported_protocols: ["claude"],
              source_protocol: "claude",
              target_protocol: "openai-responses",
              enabled: true,
              to_1m: "",
            },
          ],
          thinking_effort: "",
        },
      ],
    });

    expect(normalized.providers[0].models[0].source_protocol).toBe("gemini");
    expect(normalized.providers[0].models[0].target_protocol).toBe("claude");
    expect(normalized.providers[0].models[1].source_protocol).toBe("claude");
    expect(normalized.providers[0].models[1].target_protocol).toBe("openai-responses");
  });

  it("defaults source protocol to claude when claude is supported", () => {
    const normalized = normalizeModelMappingConfig({
      providers: [
        {
          id: "default-claude",
          name: "DefaultClaude",
          target_url: "https://example.com/anthropic",
          api_key: "secret",
          models: [
            {
              name: "hybrid",
              supported_protocols: ["gemini", "claude"],
              enabled: true,
              to_1m: "",
            },
          ],
          thinking_effort: "",
        },
      ],
    });

    expect(normalized.providers[0].models[0].source_protocol).toBe("claude");
    expect(normalized.providers[0].models[0].target_protocol).toBe("claude");
  });

  it("assigns canonical default slots globally across providers", () => {
    const normalized = normalizeModelMappingConfig({
      providers: [
        {
          id: "a",
          name: "DeepSeek",
          target_url: "https://example.com/anthropic",
          api_key: "secret",
          models: [
            { name: "a-1", to_1m: "", enabled: true, source_protocol: "claude", target_protocol: "claude" },
            { name: "a-2", to_1m: "", enabled: true, source_protocol: "claude", target_protocol: "claude" },
          ],
          thinking_effort: "",
        },
        {
          id: "b",
          name: "GLM 智谱",
          target_url: "https://example.com/anthropic",
          api_key: "secret",
          models: [{ name: "b-1", to_1m: "", enabled: true, source_protocol: "claude", target_protocol: "claude" }],
          thinking_effort: "",
        },
      ],
    });

    expect(normalized.providers[0].models[0].slot).toBe("");
    expect(normalized.providers[0].models[1].slot).toBe("");
    expect(normalized.providers[1].models[0].slot).toBe("");
  });

  it("returns the normalized slot value for display", () => {
    expect(getModelSlot({ name: "x", slot: "anthropic/claude-sonnet-current" })).toBe("anthropic/claude-sonnet-current");
  });

  it("imports all latest available models but keeps them disabled by default", () => {
    const provider: Provider = {
      id: "provider-many",
      name: "Many",
      baseUrl: "https://example.com",
      apiKey: "secret",
      createdAt: 1,
      lastResult: {
        timestamp: 2,
        results: Array.from({ length: 14 }, (_, index) => ({
          model: `model-${index}`,
          available: true,
          latency_ms: 10,
          error: null,
          supported_protocols: ["openApi"],
        })),
      },
    };

    const imported = providerToMappingProvider(provider);
    const active = getActiveMappingModels({ providers: [imported] });
    const normalized = normalizeModelMappingConfig({ providers: [imported] });

    expect(imported.models).toHaveLength(14);
    expect(active).toHaveLength(0);
    expect(normalized.providers[0].models[0].slot).toBe("");
    expect(normalized.providers[0].models[7].slot).toBe("");
    expect(normalized.providers[0].models[8].slot).toBe("");
  });

  it("imports only the selected available models when a subset is provided", () => {
    const provider: Provider = {
      id: "provider-selected",
      name: "Selected",
      baseUrl: "https://example.com",
      apiKey: "secret",
      createdAt: 1,
      lastResult: {
        timestamp: 2,
        results: [
          {
            model: "alpha",
            available: true,
            latency_ms: 10,
            error: null,
            supported_protocols: ["openApi"],
          },
          {
            model: "beta",
            available: true,
            latency_ms: 11,
            error: null,
            supported_protocols: ["claude"],
          },
          {
            model: "gamma",
            available: false,
            latency_ms: null,
            error: "failed",
          },
        ],
      },
    };

    const imported = normalizeModelMappingConfig({
      providers: [providerToMappingProvider(provider, ["beta", "missing-model"])],
    }).providers[0];

    expect(imported.models).toHaveLength(1);
    expect(imported.models[0]).toMatchObject({
      name: "beta",
      display_name: "Selected-beta",
      source_protocol: "claude",
    });
  });

  it("counts mapped models across providers", () => {
    const count = countMappingModels({
      providers: [
        {
          id: "custom",
          name: "Custom",
          target_url: "",
          api_key: "",
          models: [{ name: "x", to_1m: "", enabled: true, source_protocol: "claude", target_protocol: "claude" }],
          thinking_effort: "",
        },
      ],
    });

    expect(count).toBe(1);
  });
});
