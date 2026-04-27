import { useState, useRef, useCallback } from "react";
import type { Provider } from "../../../types";
import { listModelsByProvider, testModelsByProvider } from "../../../api";
import { logger } from "../../../lib/devlog";
import { toast } from "../../../lib/toast";
import { summarizeFailedResultDetails } from "../utils";

export function useBatchTest(
  providers: Provider[],
  onSaveResult: (id: string, result: import("../../../types").ProviderLastResult) => void,
) {
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const cancelRef = useRef(false);

  const handleBatchTest = useCallback(async () => {
    if (batchTesting) return;
    cancelRef.current = false;
    setBatchTesting(true);
    let successCount = 0;
    let stopped = false;
    logger.info(`[批量测试] 开始，共 ${providers.length} 个接口`);
    for (let i = 0; i < providers.length; i++) {
      if (cancelRef.current) {
        stopped = true;
        break;
      }
      const p = providers[i];
      setBatchProgress(`正在检测 ${i + 1} / ${providers.length}：${p.name}`);
      logger.info(
        `[批量测试] (${i + 1}/${providers.length}) ${p.name} — ${p.baseUrl}`,
      );
      try {
        const models = await listModelsByProvider(p.baseUrl, p.apiKey);
        logger.debug(`[批量测试] ${p.name} 获取到 ${models.length} 个模型`);
        if (cancelRef.current) {
          stopped = true;
          break;
        }
        const res = await testModelsByProvider(p.baseUrl, p.apiKey, models);
        const avail = res.filter((r) => r.available).length;
        const detail = summarizeFailedResultDetails(res);
        logger.success(
          `[批量测试] ${p.name} 完成：${avail}/${res.length} 可用`,
        );
        if (avail === 0 && detail) {
          logger.warn(`[批量测试] ${p.name} 错误详情：${detail}`);
        }
        onSaveResult(p.id, { timestamp: Date.now(), results: res });
        successCount++;
      } catch (e) {
        logger.error(`[批量测试] ${p.name} 失败：${String(e)}`);
      }
    }
    setBatchTesting(false);
    setBatchProgress("");
    if (stopped) {
      logger.warn(
        `[批量测试] 用户手动停止，已完成 ${successCount}/${providers.length} 个`,
      );
      toast(`批量测试已停止：${successCount} 个完成`, "warning");
    } else {
      const failed = providers.length - successCount;
      if (failed === 0) {
        logger.success(`[批量测试] 全部完成，共 ${successCount} 个接口`);
        toast(`批量测试完成：${successCount} 个完成`, "success");
      } else {
        logger.warn(`[批量测试] 完成：${successCount} 成功，${failed} 失败`);
        toast(`批量测试完成：${successCount} 成功，${failed} 失败`, "warning");
      }
    }
  }, [batchTesting, providers, onSaveResult]);

  const handleCancelBatchTest = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return {
    batchTesting,
    batchProgress,
    handleBatchTest,
    handleCancelBatchTest,
  };
}
