import { useEffect, useState } from "react";
import { loadPersistedJson, savePersistedJson } from "@/lib/persistence";
import { toast } from "@/lib/toast";
import {
  CUSTOM_PROVIDERS_DB_KEY,
  CUSTOM_PROVIDERS_KEY,
} from "./constants";
import type { CustomProviderRecord } from "./constants";

export function createEmptyCustomProvider(): CustomProviderRecord {
  return {
    id: `custom-provider-${Date.now()}`,
    name: "",
    baseUrl: "",
    apiKey: "",
    model: "",
  };
}

export function useCustomProviders() {
  const [providers, setProviders] = useState<CustomProviderRecord[]>([]);
  const [savedProviders, setSavedProviders] = useState<CustomProviderRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [ready, setReady] = useState(false);

  const selected = providers.find((item) => item.id === selectedId) ?? null;

  const dirty = JSON.stringify(providers) !== JSON.stringify(savedProviders);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const raw = await loadPersistedJson<unknown[]>(
          CUSTOM_PROVIDERS_DB_KEY,
          CUSTOM_PROVIDERS_KEY,
          [],
        );
        if (!active) return;
        const parsed = Array.isArray(raw)
          ? raw
              .filter((item): item is CustomProviderRecord => {
                return (
                  item != null &&
                  typeof (item as Record<string, unknown>).id === "string"
                );
              })
              .map((item) => ({
                id: item.id,
                name:
                  typeof item.name === "string" ? item.name : "",
                baseUrl:
                  typeof item.baseUrl === "string"
                    ? item.baseUrl
                    : "",
                apiKey:
                  typeof item.apiKey === "string"
                    ? item.apiKey
                    : "",
                model:
                  typeof item.model === "string"
                    ? item.model
                    : "",
              }))
          : [];
        setProviders(parsed);
        setSavedProviders(parsed);
        setSelectedId(parsed[0]?.id ?? "");
      } catch (error) {
        toast("读取自定义 Provider 失败", "error");
      } finally {
        if (active) setReady(true);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (providers.length === 0) {
      setSelectedId("");
      return;
    }
    const stillExists = providers.some((item) => item.id === selectedId);
    if (!stillExists) {
      setSelectedId(providers[0].id);
    }
  }, [providers, selectedId]);

  function updateRecord(
    patch: Partial<CustomProviderRecord>,
    targetId = selected?.id,
  ) {
    if (!targetId) return;
    setProviders((prev) =>
      prev.map((item) => (item.id === targetId ? { ...item, ...patch } : item)),
    );
  }

  function handleCreate() {
    const next = createEmptyCustomProvider();
    setProviders((prev) => [...prev, next]);
    setSelectedId(next.id);
  }

  function addRecord(data: Omit<CustomProviderRecord, "id">) {
    const record: CustomProviderRecord = {
      ...data,
      id: `custom-provider-${Date.now()}`,
    };
    setProviders((prev) => [...prev, record]);
    setSelectedId(record.id);
    return record;
  }

  async function handleSaveAll(override?: CustomProviderRecord[]) {
    const data = override ?? providers;
    await savePersistedJson(CUSTOM_PROVIDERS_DB_KEY, data);
    setSavedProviders(data);
    toast("自定义 Provider 已保存", "success");
  }

  async function handleDelete(targetId: string) {
    const next = providers.filter((item) => item.id !== targetId);
    setProviders(next);
    setSavedProviders(next);
    if (selectedId === targetId) {
      setSelectedId(next[0]?.id ?? "");
    }
    await savePersistedJson(CUSTOM_PROVIDERS_DB_KEY, next);
    toast("已删除", "success");
  }

  return {
    providers,
    setProviders,
    savedProviders,
    selected,
    selectedId,
    setSelectedId,
    dirty,
    ready,
    updateRecord,
    handleCreate,
    handleSaveAll,
    handleDelete,
    addRecord,
  };
}
