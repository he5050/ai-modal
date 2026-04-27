import { useState, useEffect, useCallback } from "react";
import type { RulePath } from "../types";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { parseRulePaths } from "../lib/parsers";

const RULE_PATHS_KEY = "ai-modal-rule-paths";
const RULE_PATHS_DB_KEY = "rule_paths";

export function useRulePaths() {
  const [rulePaths, setRulePaths] = useState<RulePath[]>([]);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPersistedJson<unknown[]>(RULE_PATHS_DB_KEY, RULE_PATHS_KEY, []).then(
      (raw) => {
        if (!active) return;
        setRulePaths(parseRulePaths(raw));
        setStorageReady(true);
      },
    ).catch(() => {
      if (active) setStorageReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const payload = rulePaths.map(({ id, label, path, isBuiltin, kind }) => ({
      id, label, path, isBuiltin, kind,
    }));
    void savePersistedJson(RULE_PATHS_DB_KEY, payload, RULE_PATHS_KEY).catch(() => {});
  }, [rulePaths, storageReady]);

  const changePath = useCallback((id: string, path: string) => {
    setRulePaths((prev) => {
      const current = prev.find((item) => item.id === id);
      const rest = prev.filter((item) => item.id !== id);
      return [...rest, { id, label: current?.label ?? id, path, isBuiltin: current?.isBuiltin ?? true, kind: current?.kind ?? "file" }];
    });
  }, []);

  const addPath = useCallback((input: { label: string; path: string; kind?: "file" | "directory" }) => {
    setRulePaths((prev) => [
      ...prev,
      { id: `custom-${Date.now()}`, label: input.label.trim(), path: input.path.trim(), isBuiltin: false, kind: input.kind ?? "file" },
    ]);
  }, []);

  const deletePath = useCallback((id: string) => {
    setRulePaths((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { rulePaths, storageReady, changePath, addPath, deletePath };
}
