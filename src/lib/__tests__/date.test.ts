import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  formatDateTime,
  formatDateShort,
  formatTime,
  formatFullDate,
  formatRelative,
} from "../date";

describe("date utils", () => {
  const fixedDate = new Date(2025, 0, 15, 14, 30, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 14, 35, 0));
  });

  describe("formatDateTime", () => {
    it("formats date time with defaults", () => {
      const result = formatDateTime(fixedDate.getTime());
      expect(result).toContain("2025");
      expect(result).toContain("01");
      expect(result).toContain("15");
    });

    it("returns placeholder for null/undefined", () => {
      expect(formatDateTime(null)).toBe("—");
      expect(formatDateTime(undefined)).toBe("—");
    });

    it("accepts Date object", () => {
      const result = formatDateTime(fixedDate);
      expect(result).toContain("2025");
    });
  });

  describe("formatDateShort", () => {
    it("formats short date (MM/DD HH:mm)", () => {
      const result = formatDateShort(fixedDate);
      expect(result).toContain("01");
      expect(result).toContain("15");
      expect(result).toContain("14:30");
    });
  });

  describe("formatTime", () => {
    it("formats time only", () => {
      const result = formatTime(fixedDate);
      expect(result).toContain("14:");
    });
  });

  describe("formatFullDate", () => {
    it("includes seconds", () => {
      const result = formatFullDate(fixedDate);
      expect(result).toContain(":00");
    });
  });

  describe("formatRelative", () => {
    it("shows seconds for recent timestamps", () => {
      vi.setSystemTime(new Date(2025, 0, 15, 14, 30, 5));
      expect(formatRelative(fixedDate.getTime())).toBe("5 秒前");
    });

    it("returns placeholder for null", () => {
      expect(formatRelative(null)).toBe("—");
    });
  });
});
