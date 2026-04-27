import { useState, useEffect, useCallback } from "react";
import type { ConfigPath } from "../types";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { parseConfigPaths } from "../lib/parsers";

const CONFIG_PATHS_KEY = "ai-modal-config-paths";
const CONFIG_PATHS_DB_KEY = "config_paths";

export function useConfigPaths() {
  const [configPaths, setConfigPaths] = useState<ConfigPath[]>([]);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPersistedJson<unknown[]>(CONFIG_PATHS_DB_KEY, CONFIG_PATHS_KEY, []).then(
      (raw) => {
        if (!active) return;
        setConfigPaths(parseConfigPaths(raw));
        setStorageReady(true);
      },
    ).catch(() => {
      if (active) setStorageReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const payload = configPaths.map(({ id, label, path, isBuiltin, kind, format }) => ({
      id, label, path, isBuiltin, kind, format,
    }));
    void savePersistedJson(CONFIG_PATHS_DB_KEY, payload, CONFIG_PATHS_KEY).catch(() => {});
  }, [configPaths, storageReady]);

  const upsertPath = useCallback((next: ConfigPath) => {
    setConfigPaths((prev) => {
      const rest = prev.filter((item) => item.id !== next.id);
      return [...rest, next];
    });
  }, []);

  const deletePath = useCallback((id: string) => {
    setConfigPaths((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { configPaths, storageReady, upsertPath, deletePath };
}
