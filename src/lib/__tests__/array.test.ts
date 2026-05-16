import { describe, it, expect } from "vitest";
import {
  unique,
  sortBy,
  sortByLocale,
  groupBy,
  pluck,
  paginate,
  chunk,
} from "../array";

describe("unique", () => {
  it("removes duplicates from array", () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it("handles empty array", () => {
    expect(unique([])).toEqual([]);
  });

  it("handles strings", () => {
    expect(unique(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("sortBy", () => {
  const data = [
    { name: "Charlie", age: 30 },
    { name: "Alice", age: 25 },
    { name: "Bob", age: 35 },
  ];

  it("sorts by key ascending", () => {
    const result = sortBy(data, "age");
    expect(result.map((d) => d.name)).toEqual(["Alice", "Charlie", "Bob"]);
  });

  it("sorts by key descending", () => {
    const result = sortBy(data, "age", "desc");
    expect(result.map((d) => d.name)).toEqual(["Bob", "Charlie", "Alice"]);
  });

  it("does not mutate original array", () => {
    const copy = [...data];
    sortBy(data, "name");
    expect(data).toEqual(copy);
  });
});

describe("sortByLocale", () => {
  it("sorts strings with locale awareness", () => {
    const data = ["张三", "李四", "王五"];
    const result = sortByLocale(data, (s) => s);
    expect(result).toEqual([...data].sort());
  });
});

describe("groupBy", () => {
  it("groups by key", () => {
    const data = [
      { type: "a", value: 1 },
      { type: "b", value: 2 },
      { type: "a", value: 3 },
    ];
    const groups = groupBy(data, "type");
    expect(Object.keys(groups)).toEqual(["a", "b"]);
    expect(groups.a.length).toBe(2);
    expect(groups.b.length).toBe(1);
  });

  it("groups by function", () => {
    const data = [1, 2, 3, 4, 5, 6];
    const groups = groupBy(data, (n) => (n % 2 === 0 ? "even" : "odd"));
    expect(groups.odd).toEqual([1, 3, 5]);
    expect(groups.even).toEqual([2, 4, 6]);
  });
});

describe("pluck", () => {
  it("extracts property values", () => {
    const data = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: null, name: "c" },
    ];
    expect(pluck(data, "id")).toEqual([1, 2]);
  });

  it("returns empty for empty input", () => {
    expect(pluck([], "x")).toEqual([]);
  });
});

describe("paginate", () => {
  const arr = Array.from({ length: 25 }, (_, i) => i);

  it("returns correct page", () => {
    const { items, totalPages, total } = paginate(arr, 2, 10);
    expect(items).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(totalPages).toBe(3);
    expect(total).toBe(25);
  });

  it("clamps page to valid range", () => {
    const { items } = paginate(arr, 100, 10);
    expect(items.length).toBeLessThanOrEqual(10);
  });

  it("handles empty array", () => {
    const { items, totalPages, total } = paginate([], 1, 10);
    expect(items).toEqual([]);
    expect(totalPages).toBe(1);
    expect(total).toBe(0);
  });
});

describe("chunk", () => {
  it("chunks array into groups", () => {
    const data = [1, 2, 3, 4, 5];
    const chunks = chunk(data, 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("handles chunk size larger than array", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });
});
