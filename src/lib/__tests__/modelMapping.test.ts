import { describe, expect, it } from "vitest";
import {
  countMappingModels,
  getActiveMappingModels,
  makeModelSlot,
  providerToMappingProvider,
} from "../modelMapping";
import type { Provider } from "../../types";

describe("modelMapping", () => {
  it("matches ModelLink slot naming", () => {
    expect(makeModelSlot("kimi-k2.6")).toBe("claude-kimi-k2.6");
    expect(makeModelSlot("glm 5 turbo")).toBe("claude-glm-5-turbo");
    expect(makeModelSlot("模型/测试")).toBe("claude------");
  });

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

    const imported = providerToMappingProvider(provider);

    expect(imported.target_url).toBe("https://openrouter.ai/api");
    expect(imported.id).toBe("provider-1");
    expect(imported.models).toHaveLength(1);
    expect(imported.models[0]).toMatchObject({
      name: "available-model",
      to_1m: "",
      enabled: false,
      protocol: "claude",
    });
    expect(typeof imported.models[0].id).toBe("string");
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

    expect(imported.models).toHaveLength(14);
    expect(active).toHaveLength(0);
  });

  it("counts mapped models across providers", () => {
    const count = countMappingModels({
      providers: [
        {
          id: "custom",
          name: "Custom",
          target_url: "",
          api_key: "",
          models: [{ name: "x", to_1m: "", enabled: true, protocol: "claude" }],
          thinking_effort: "",
        },
      ],
    });

    expect(count).toBe(1);
  });
});
