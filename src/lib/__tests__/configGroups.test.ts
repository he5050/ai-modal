import { describe, expect, it } from "vitest";
import { buildConfigGroups } from "../configGroups";

describe("configGroups", () => {
  it("includes builtin Snow config files", () => {
    const groups = buildConfigGroups([], "/Users/test");
    const snowGroup = groups.find((group) => group.id === "snow");

    expect(snowGroup).toBeDefined();
    expect(snowGroup?.rootDir).toBe(".snow");
    expect(snowGroup?.files.map((file) => file.fileName)).toEqual([
      "active-profile.json",
      "config.json",
      "mcp-config.json",
      "proxy-config.json",
      "system-prompt.json",
      "custom-headers.json",
      "language.json",
      "theme.json",
    ]);
  });

  it("uses Gemini .settings.json and env file definitions", () => {
    const groups = buildConfigGroups([], "/Users/test");
    const geminiGroup = groups.find((group) => group.id === "gemini");

    expect(geminiGroup?.files.map((file) => file.fileName)).toEqual([
      ".settings.json",
      ".env",
    ]);
    expect(geminiGroup?.files.map((file) => file.format)).toEqual([
      "json",
      "env",
    ]);
  });
});
