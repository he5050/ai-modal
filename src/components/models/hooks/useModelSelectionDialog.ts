import { useState, useCallback } from "react";
import type { Provider } from "@/types";
import { listModels } from "@/api";
import { logger } from "@/lib/devlog";
import { friendlyError } from "../utils";

interface UseModelSelectionDialogOptions {
  getBaseUrl: () => string;
  getApiKey: () => string;
  getProviderName?: () => string;
  getInitialSelectedModels?: () => string[];
  onConfirm: (selectedModels: string[], protocols: import("../../../lib/protocolUtils").ModelTestProtocol[]) => void;
  onManualConfirm?: (models: string[], protocols: import("../../../lib/protocolUtils").ModelTestProtocol[]) => void;
  localModels?: string[]; // 新增：直接使用本地模型，不走 API
}

interface ModelSelectionDialogState {
  open: boolean;
  loading: boolean;
  error: string | null;
  fetchedModels: string[];
}

interface UseModelSelectionDialogReturn {
  dialogState: ModelSelectionDialogState;
  openDialog: () => void;
  openDialogWithLocalModels: (models: string[]) => void;
  closeDialog: () => void;
  handleConfirm: (selectedModels: string[], protocols: import("../../../lib/protocolUtils").ModelTestProtocol[]) => void;
  handleManualConfirm: (models: string[], protocols: import("../../../lib/protocolUtils").ModelTestProtocol[]) => void;
  handleRetry: () => void;
  initialSelectedModels: string[];
}

export function useModelSelectionDialog({
  getBaseUrl,
  getApiKey,
  getProviderName,
  getInitialSelectedModels,
  onConfirm,
  onManualConfirm,
  localModels,
}: UseModelSelectionDialogOptions): UseModelSelectionDialogReturn {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);

  const resetState = useCallback(() => {
    setFetchedModels([]);
    setError(null);
    setLoading(false);
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
    resetState();
  }, [resetState]);

  const openDialog = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setFetchedModels([]);

    // 如果提供了本地模型，直接使用
    if (localModels && localModels.length > 0) {
      const sorted = [...localModels].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      );
      setFetchedModels(sorted);
      setLoading(false);
      const name = getProviderName?.() ?? "provider";
      logger.success(`[模型选择] ${name} 使用本地已保存模型，共 ${sorted.length} 个`);
      return;
    }

    // 否则从 API 获取
    try {
      const models = await listModels(getBaseUrl().trim(), getApiKey().trim());
      const sorted = [...models].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      );
      setFetchedModels(sorted);
      setLoading(false);
      const name = getProviderName?.() ?? "provider";
      logger.success(`[模型选择] ${name} v1/models 获取到 ${sorted.length} 个模型`);
    } catch (e) {
      const msg = friendlyError(e);
      const name = getProviderName?.() ?? "provider";
      logger.error(`[模型选择] ${name} v1/models 获取失败：${msg}`);
      setError(msg);
      setLoading(false);
    }
  }, [getBaseUrl, getApiKey, getProviderName, localModels]);

  const handleConfirm = useCallback(
    (selectedModels: string[], protocols: import("../../../lib/protocolUtils").ModelTestProtocol[]) => {
      closeDialog();
      onConfirm(selectedModels, protocols);
    },
    [closeDialog, onConfirm],
  );

  const handleManualConfirm = useCallback(
    (models: string[], protocols: import("../../../lib/protocolUtils").ModelTestProtocol[]) => {
      closeDialog();
      onManualConfirm?.(models, protocols);
    },
    [closeDialog, onManualConfirm],
  );

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setFetchedModels([]);
    void (async () => {
      try {
        const models = await listModels(getBaseUrl().trim(), getApiKey().trim());
        const sorted = [...models].sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase()),
        );
        setFetchedModels(sorted);
        setLoading(false);
      } catch (e) {
        const msg = friendlyError(e);
        setError(msg);
        setLoading(false);
      }
    })();
  }, [getBaseUrl, getApiKey]);

  const openDialogWithLocalModels = useCallback((models: string[]) => {
    setOpen(true);
    setLoading(false);
    setError(null);
    const sorted = [...models].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    setFetchedModels(sorted);
    const name = getProviderName?.() ?? "provider";
    logger.success(`[模型选择] ${name} 使用本地已保存模型，共 ${sorted.length} 个`);
  }, [getProviderName]);

  return {
    dialogState: { open, loading, error, fetchedModels },
    openDialog,
    openDialogWithLocalModels,
    closeDialog,
    handleConfirm,
    handleManualConfirm,
    handleRetry,
    initialSelectedModels: getInitialSelectedModels?.() ?? [],
  };
}
