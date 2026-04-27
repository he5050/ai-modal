import { useState, useEffect, useCallback } from "react";
import type { PromptRecord } from "../types";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { parsePrompts } from "../lib/parsers";

const PROMPTS_KEY = "ai-modal-prompts";
const PROMPTS_DB_KEY = "prompts";

export function usePrompts() {
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPersistedJson<unknown[]>(PROMPTS_DB_KEY, PROMPTS_KEY, []).then(
      (raw) => {
        if (!active) return;
        setPrompts(parsePrompts(raw));
        setStorageReady(true);
      },
    ).catch(() => {
      if (active) setStorageReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    void savePersistedJson(PROMPTS_DB_KEY, prompts, PROMPTS_KEY).catch(() => {});
  }, [prompts, storageReady]);

  const savePrompt = useCallback((next: PromptRecord) => {
    setPrompts((prev) => {
      const exists = prev.some((item) => item.id === next.id);
      const updated = exists
        ? prev.map((item) => (item.id === next.id ? next : item))
        : [next, ...prev];
      return [...updated].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const deletePrompt = useCallback((id: string) => {
    setPrompts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const importPrompts = useCallback((raw: PromptRecord[]) => {
    setPrompts(raw);
  }, []);

  return { prompts, storageReady, savePrompt, deletePrompt, importPrompts };
}
