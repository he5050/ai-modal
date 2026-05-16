export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function sortBy<T>(
  arr: T[],
  key: keyof T | ((item: T) => string | number),
  order: "asc" | "desc" = "asc",
): T[] {
  const sorted = [...arr];
  const getter = typeof key === "function" ? key : (item: T) => item[key] as string | number;
  sorted.sort((a, b) => {
    const va = getter(a);
    const vb = getter(b);
    if (va < vb) return order === "asc" ? -1 : 1;
    if (va > vb) return order === "asc" ? 1 : -1;
    return 0;
  });
  return sorted;
}

export function sortByLocale<T>(
  arr: T[],
  key: keyof T | ((item: T) => string),
  order: "asc" | "desc" = "asc",
): T[] {
  const sorted = [...arr];
  const getter = typeof key === "function" ? key : (item: T) => String(item[key]);
  sorted.sort((a, b) => {
    const cmp = getter(a).localeCompare(getter(b));
    return order === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export function groupBy<T>(
  arr: T[],
  key: keyof T | ((item: T) => string),
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  const getter = typeof key === "function" ? key : (item: T) => String(item[key]);
  for (const item of arr) {
    const k = getter(item);
    if (!groups[k]) groups[k] = [];
    groups[k].push(item);
  }
  return groups;
}

export function pluck<T, K extends keyof T>(arr: T[], key: K): T[K][] {
  return arr.map((item) => item[key]).filter((v): v is T[K] => v != null);
}

export function paginate<T>(
  arr: T[],
  page: number,
  pageSize: number,
): { items: T[]; totalPages: number; total: number } {
  const total = arr.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const items = arr.slice(start, start + pageSize);
  return { items, totalPages, total };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
