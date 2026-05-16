import { useState, useEffect, useCallback } from "react";
import type { Provider, ProviderLastResult } from "@/types";
import { loadPersistedJson, savePersistedJson } from "@/lib/persistence";
import { parseProviders } from "@/lib/parsers";
import { encryptField, decryptField } from "@/lib/secureStorage";

const PROVIDERS_KEY = "ai-modal-providers";
const PROVIDERS_DB_KEY = "providers";

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPersistedJson<unknown[]>(PROVIDERS_DB_KEY, PROVIDERS_KEY, []).then(
      async (raw) => {
        if (!active) return;
        // 自动迁移：解密已加密的 API Key
        const providers = parseProviders(raw);
        const needsMigration = providers.some((p) => p.apiKey && p.apiKey.startsWith("enc:v1:"));
        if (needsMigration) {
          const decrypted = await Promise.all(
            providers.map(async (p) => ({
              ...p,
              apiKey: await decryptField(p.apiKey),
            })),
          );
          if (active) setProviders(decrypted);
        } else {
          if (active) setProviders(providers);
        }
        if (active) setStorageReady(true);
      },
    ).catch(() => {
      if (active) setStorageReady(true);
    });
    return () => { active = false; };
  }, []);

  // 防抖持久化：避免每次 setState 都立即写 DB，API Key 加密后存储
  useEffect(() => {
    if (!storageReady) return;
    const timer = setTimeout(() => {
      void (async () => {
        const encrypted = await Promise.all(
          providers.map(async (p) => ({
            ...p,
            apiKey: await encryptField(p.apiKey),
          })),
        );
        await savePersistedJson(PROVIDERS_DB_KEY, encrypted, PROVIDERS_KEY);
      })().catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [providers, storageReady]);

  const addProvider = useCallback(
    (data: Omit<Provider, "id" | "createdAt" | "lastResult">) => {
      const p: Provider = {
        ...data,
        id: Date.now().toString(),
        createdAt: Date.now(),
      };
      setProviders((prev) => [...prev, p]);
      return p.id;
    },
    [],
  );

  const editProvider = useCallback(
    (id: string, data: Omit<Provider, "id" | "createdAt" | "lastResult">) => {
      setProviders((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const configChanged = p.baseUrl !== data.baseUrl || p.apiKey !== data.apiKey;
          return { ...p, ...data, lastResult: configChanged ? undefined : p.lastResult };
        }),
      );
    },
    [],
  );

  const deleteProvider = useCallback(
    (id: string) => setProviders((prev) => prev.filter((p) => p.id !== id)),
    [],
  );

  const saveResult = useCallback((id: string, result: ProviderLastResult) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, lastResult: result } : p)),
    );
  }, []);

  const importProviders = useCallback((imported: Provider[]) => {
    setProviders((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newOnes = imported.filter((p) => !existingIds.has(p.id));
      return [...prev, ...newOnes];
    });
  }, []);

  return {
    providers,
    storageReady,
    addProvider,
    editProvider,
    deleteProvider,
    saveResult,
    importProviders,
  };
}
