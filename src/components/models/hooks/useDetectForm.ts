import { useState, useEffect, useCallback } from "react";
import type { Provider } from "../../../types";

export function useDetectForm(
  providers: Provider[],
  editTarget: Provider | null,
  onClearEditTarget: () => void,
  onDirtyChange: (dirty: boolean) => void,
) {
  const [name, setName] = useState("");
  const [origName, setOrigName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [origBaseUrl, setOrigBaseUrl] = useState("");
  const [origApiKey, setOrigApiKey] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editingProvider =
    editingId != null
      ? (providers.find((provider) => provider.id === editingId) ?? null)
      : null;

  const isDirty =
    !!editingId &&
    (name !== origName || baseUrl !== origBaseUrl || apiKey !== origApiKey);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // editTarget 回填
  useEffect(() => {
    if (!editTarget) return;
    setName(editTarget.name);
    setOrigName(editTarget.name);
    setBaseUrl(editTarget.baseUrl);
    setApiKey(editTarget.apiKey);
    setManualModel("");
    setEditingId(editTarget.id);
    setOrigBaseUrl(editTarget.baseUrl);
    setOrigApiKey(editTarget.apiKey);
    onClearEditTarget();
  }, [editTarget?.id]);

  const handleReset = useCallback(() => {
    setName("");
    setBaseUrl("");
    setApiKey("");
    setManualModel("");
    setOrigName("");
    setEditingId(null);
    setOrigBaseUrl("");
    setOrigApiKey("");
    setUrlError(null);
    setSaving(false);
  }, []);

  const handleLoadHistory = useCallback((p: Provider) => {
    setName(p.name);
    setBaseUrl(p.baseUrl);
    setApiKey(p.apiKey);
    setManualModel("");
    setOrigName(p.name);
    setOrigBaseUrl(p.baseUrl);
    setOrigApiKey(p.apiKey);
    setEditingId(p.id);
    setUrlError(null);
  }, []);

  return {
    name,
    setName,
    origName,
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    manualModel,
    setManualModel,
    keyVisible,
    setKeyVisible,
    editingId,
    setEditingId,
    origBaseUrl,
    origApiKey,
    urlError,
    setUrlError,
    saving,
    setSaving,
    editingProvider,
    isDirty,
    handleReset,
    handleLoadHistory,
  };
}
