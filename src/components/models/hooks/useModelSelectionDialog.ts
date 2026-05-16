import { useState, useCallback } from "react";
import type { Provider } from "../../../types";
import { listModels } from "../../../api";
import { logger } from "../../../lib/devlog";
import { friendlyError } from "../utils";

interface UseModelSelectionDialogOptions {
  getBaseUrl: () => string;
  getApiKey: () => string;
  getProviderName?: () => string;
  getInitialSelectedModels?: () => string[];
  onConfirm: (selectedModels: string[], protocols: import("../../../lib/protocolUtils").ModelTestProtocol[]) => void;
  onManualConfirm?: (models: string[], protocols: import("../../../lib/protocolUtils").ModelTestProtocol[]) => void;
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
  }, [getBaseUrl, getApiKey, getProviderName]);

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

  return {
    dialogState: { open, loading, error, fetchedModels },
    openDialog,
    closeDialog,
    handleConfirm,
    handleManualConfirm,
    handleRetry,
    initialSelectedModels: getInitialSelectedModels?.() ?? [],
  };
}
