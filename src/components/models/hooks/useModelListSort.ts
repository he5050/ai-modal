import { useState, useCallback } from "react";
import { savePersistedJson } from "../../../lib/persistence";
import { SORT_KEY_DB_KEY, SORT_DIR_DB_KEY } from "../constants";
import type { Filter, SortKey, SortDir } from "../types";

export function useModelListSort() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>(
    () =>
      (localStorage.getItem("ai-modal-sort-key") as SortKey) ?? "time",
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () =>
      (localStorage.getItem("ai-modal-sort-dir") as SortDir) ?? "desc",
  );

  const handleSort = useCallback((key: SortKey) => {
    let newKey: SortKey, newDir: SortDir;
    if (sortKey === key) {
      if (sortDir === "asc") {
        newKey = key;
        newDir = "desc";
      } else {
        newKey = null;
        newDir = "asc";
      }
    } else {
      newKey = key;
      newDir = "asc";
    }
    setSortKey(newKey);
    setSortDir(newDir);
    if (newKey) {
      localStorage.setItem("ai-modal-sort-key", newKey);
      localStorage.setItem("ai-modal-sort-dir", newDir);
    } else {
      localStorage.removeItem("ai-modal-sort-key");
      localStorage.setItem("ai-modal-sort-dir", "asc");
    }
    void savePersistedJson(SORT_KEY_DB_KEY, newKey, "ai-modal-sort-key");
    void savePersistedJson(SORT_DIR_DB_KEY, newDir, "ai-modal-sort-dir");
  }, [sortKey, sortDir]);

  const handleFilterChange = useCallback((f: Filter) => {
    setFilter(f);
  }, []);

  return { filter, sortKey, sortDir, handleSort, handleFilterChange };
}
