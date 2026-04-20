import { describe, expect, it } from "vitest";
import {
  buildPromptCategories,
  createEmptyPrompt,
  mergeImportedPrompts,
  parsePromptCategories,
  parsePromptImportJson,
  serializePromptCategories,
  summarizePromptImport,
} from "../promptStore";

describe("promptStore", () => {
  it("creates a new prompt record with required defaults", () => {
    const now = 1_700_000_000_000;
    const record = createEmptyPrompt(now, "产品");

    expect(record).toMatchObject({
      title: "",
      content: "",
      category: "产品",
      tags: [],
      note: "",
      createdAt: now,
      updatedAt: now,
    });
    expect(typeof record.id).toBe("string");
    expect(record.id.length).toBeGreaterThan(0);
  });

  it("aggregates category cards from prompt records", () => {
    const categories = buildPromptCategories([
      {
        id: "a",
        title: "A",
        content: "alpha",
        category: "产品 / 高频",
        tags: ["高频"],
        note: "",
        createdAt: 1,
        updatedAt: 10,
      },
      {
        id: "b",
        title: "B",
        content: "beta",
        category: "开发",
        tags: [],
        note: "",
        createdAt: 2,
        updatedAt: 20,
      },
      {
        id: "c",
        title: "C",
        content: "gamma",
        category: "产品",
        tags: [],
        note: "",
        createdAt: 3,
        updatedAt: 30,
      },
    ]);

    expect(categories).toEqual([
      { key: "全部", label: "全部", count: 3, updatedAt: 30 },
      { key: "产品", label: "产品", count: 2, updatedAt: 30 },
      { key: "高频", label: "高频", count: 1, updatedAt: 10 },
      { key: "开发", label: "开发", count: 1, updatedAt: 20 },
    ]);
  });

  it("normalizes category text into unique segments and serializes it back", () => {
    expect(parsePromptCategories("产品 / 接口, 排查，产品")).toEqual([
      "产品",
      "接口",
      "排查",
    ]);
    expect(serializePromptCategories(["产品", "接口", "排查", "产品"])).toBe(
      "产品 / 接口 / 排查",
    );
  });

  it("parses valid prompt import json and rejects malformed records", () => {
    const payload = JSON.stringify([
      {
        id: "prompt-1",
        title: "Prompt 1",
        content: "Body",
        category: "产品",
        tags: ["高频"],
        note: "note",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "broken",
        title: "",
      },
    ]);

    const result = parsePromptImportJson(payload);

    expect(result.valid).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.valid[0].title).toBe("Prompt 1");
  });

  it("merges imported prompts by id into add/overwrite/skip counts", () => {
    const existing = [
      {
        id: "same",
        title: "Old",
        content: "Old body",
        category: "产品",
        tags: [],
        note: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const imported = [
      {
        id: "same",
        title: "New",
        content: "New body",
        category: "产品",
        tags: [],
        note: "updated",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "fresh",
        title: "Fresh",
        content: "Fresh body",
        category: "开发",
        tags: ["新增"],
        note: "",
        createdAt: 3,
        updatedAt: 4,
      },
    ];

    const result = mergeImportedPrompts(existing, imported);

    expect(result.summary).toEqual({
      added: 1,
      overwritten: 1,
      skipped: 0,
    });
    expect(result.nextRecords).toHaveLength(2);
    expect(result.nextRecords.find((item) => item.id === "same")?.title).toBe("New");
  });

  it("formats import summary text for toast feedback", () => {
    expect(summarizePromptImport({ added: 2, overwritten: 1, skipped: 3 })).toBe(
      "新增 2 条，覆盖 1 条，跳过 3 条",
    );
  });
});
