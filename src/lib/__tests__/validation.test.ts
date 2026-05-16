import { describe, it, expect } from "vitest";
import {
  isUrl,
  isEmpty,
  validateRequired,
  validateUrl,
  isValidApiKey,
  maskString,
  truncate,
} from "../validation";

describe("isUrl", () => {
  it("returns true for valid http URL", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });

  it("returns true for valid https URL", () => {
    expect(isUrl("https://api.openai.com/v1")).toBe(true);
  });

  it("returns false for non-URL strings", () => {
    expect(isUrl("not-a-url")).toBe(false);
    expect(isUrl("ftp://example.com")).toBe(false);
  });

  it("handles null/undefined", () => {
    expect(isUrl(null)).toBe(false);
    expect(isUrl(undefined)).toBe(false);
    expect(isUrl("")).toBe(false);
  });
});

describe("isEmpty", () => {
  it("returns true for empty string", () => {
    expect(isEmpty("")).toBe(true);
    expect(isEmpty("   ")).toBe(true);
  });

  it("returns false for non-empty string", () => {
    expect(isEmpty("hello")).toBe(false);
  });

  it("returns true for null/undefined", () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });
});

describe("validateRequired", () => {
  it("returns error for empty value", () => {
    expect(validateRequired("", "名称")).toContain("不能为空");
  });

  it("returns null for valid value", () => {
    expect(validateRequired("test")).toBeNull();
  });
});

describe("validateUrl", () => {
  it("returns error for invalid URL", () => {
    const result = validateUrl("not-url");
    expect(result).not.toBeNull();
    expect(result).toContain("http");
  });

  it("returns null for valid URL", () => {
    expect(validateUrl("https://example.com")).toBeNull();
  });
});

describe("isValidApiKey", () => {
  it("returns true for keys >= 8 chars", () => {
    expect(isValidApiKey("sk-1234567890")).toBe(true);
  });

  it("returns false for short keys", () => {
    expect(isValidApiKey("short")).toBe(false);
  });

  it("returns false for empty", () => {
    expect(isValidApiKey("")).toBe(false);
    expect(isValidApiKey(null)).toBe(false);
  });
});

describe("maskString", () => {
  it("masks middle characters", () => {
    const result = maskString("my-secret-key");
    expect(result).toContain("my");
    expect(result).toContain("ey");
    expect(result).toContain("******");
  });

  it("returns placeholder for empty", () => {
    expect(maskString("")).toBe("—");
  });

  it("fully masks short strings", () => {
    expect(maskString("ab")).toBe("**");
  });
});

describe("truncate", () => {
  it("truncates long strings", () => {
    const result = truncate("Hello World", 8);
    expect(result).toBe("Hello...");
  });

  it("returns original if within limit", () => {
    expect(truncate("Hi", 10)).toBe("Hi");
  });
});
