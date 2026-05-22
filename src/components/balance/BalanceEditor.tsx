import { useState } from "react";
import { X, Play, Loader2, Check, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui";
import {
  BUTTON_GHOST_CLASS,
  BUTTON_ICON_DANGER_SM_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_SM_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles";
import { FIELD_INPUT_CLASS, FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "@/lib/formStyles";
import { parseCurlCommand, getAllPaths, getValueByPath, formatValue } from "@/lib/curlParser";
import { executeLoginCurl, executeBalanceQuery } from "@/api";
import { toast } from "@/lib/toast";
import type { BalanceRecord, ParsedCurl } from "@/types";

interface BalanceEditorProps {
  record?: BalanceRecord | null;
  onSave: (record: BalanceRecord) => void;
  onCancel: () => void;
}

export function BalanceEditor({ record, onSave, onCancel }: BalanceEditorProps) {
  const [label, setLabel] = useState(record?.label ?? "");
  const [loginCurl, setLoginCurl] = useState(record?.login.curl ?? "");
  const [queryCurl, setQueryCurl] = useState(record?.query.curl ?? "");
  const [tokenFieldPath, setTokenFieldPath] = useState(record?.login.tokenFieldPath ?? "");
  const [tokenPlaceholder, setTokenPlaceholder] = useState(record?.query.tokenPlaceholder ?? "{{token}}");
  const [displayFields, setDisplayFields] = useState<string[]>(record?.query.displayFields ?? []);

  const [loginParsed, setLoginParsed] = useState<ParsedCurl | null>(record?.login.parsed ?? null);
  const [queryParsed, setQueryParsed] = useState<ParsedCurl | null>(record?.query.parsed ?? null);

  const [loginResult, setLoginResult] = useState<Record<string, unknown> | null>(null);
  const [queryResult, setQueryResult] = useState<Record<string, unknown> | null>(null);
  const [testingLogin, setTestingLogin] = useState(false);
  const [testingQuery, setTestingQuery] = useState(false);

  const [loginPaths, setLoginPaths] = useState<string[]>([]);
  const [queryPaths, setQueryPaths] = useState<string[]>([]);

  const handleParseLoginCurl = () => {
    try {
      const parsed = parseCurlCommand(loginCurl);
      setLoginParsed(parsed);
      toast("登录 cURL 解析成功", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "解析失败", "error");
    }
  };

  const handleParseQueryCurl = () => {
    try {
      const parsed = parseCurlCommand(queryCurl);
      setQueryParsed(parsed);
      toast("查询 cURL 解析成功", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "解析失败", "error");
    }
  };

  const handleTestLogin = async () => {
    if (!loginCurl.trim()) {
      toast("请输入登录 cURL", "warning");
      return;
    }
    setTestingLogin(true);
    try {
      const result = await executeLoginCurl(loginCurl);
      if (result.ok && result.data) {
        setLoginResult(result.data);
        const paths = getAllPaths(result.data);
        setLoginPaths(paths);
        toast("登录请求成功，请选择 token 字段", "success");
      } else {
        toast(result.error || "登录请求失败", "error");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "请求失败", "error");
    } finally {
      setTestingLogin(false);
    }
  };

  const handleTestQuery = async () => {
    if (!queryCurl.trim()) {
      toast("请输入查询 cURL", "warning");
      return;
    }
    if (!tokenPlaceholder.trim()) {
      toast("请输入 token 占位符", "warning");
      return;
    }

    // 使用一个模拟 token 来测试查询结构
    const mockToken = "mock_token_for_testing";
    setTestingQuery(true);
    try {
      const result = await executeBalanceQuery({
        curl: queryCurl,
        token: mockToken,
        tokenPlaceholder,
      });
      if (result.ok && result.data) {
        setQueryResult(result.data);
        const paths = getAllPaths(result.data);
        setQueryPaths(paths);
        toast("查询请求成功，请选择展示字段", "success");
      } else {
        // 即使失败，也可能有响应数据
        if (result.data) {
          setQueryResult(result.data);
          const paths = getAllPaths(result.data);
          setQueryPaths(paths);
        }
        toast(result.error || "查询请求失败", "error");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "请求失败", "error");
    } finally {
      setTestingQuery(false);
    }
  };

  const toggleDisplayField = (path: string) => {
    setDisplayFields((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const handleSave = () => {
    if (!label.trim()) {
      toast("请输入标签名称", "warning");
      return;
    }
    if (!loginCurl.trim() || !queryCurl.trim()) {
      toast("请输入登录和查询 cURL", "warning");
      return;
    }
    if (!tokenFieldPath.trim()) {
      toast("请选择 token 字段", "warning");
      return;
    }

    const now = Date.now();
    const newRecord: BalanceRecord = {
      id: record?.id ?? `balance-${now}`,
      label: label.trim(),
      login: {
        curl: loginCurl.trim(),
        parsed: loginParsed ?? parseCurlCommand(loginCurl),
        tokenFieldPath,
      },
      query: {
        curl: queryCurl.trim(),
        parsed: queryParsed ?? parseCurlCommand(queryCurl),
        tokenPlaceholder: tokenPlaceholder.trim() || "{{token}}",
        displayFields,
      },
      lastToken: record?.lastToken ?? null,
      lastQueryResult: record?.lastQueryResult ?? null,
      lastQueryAt: record?.lastQueryAt ?? null,
      createdAt: record?.createdAt ?? now,
      updatedAt: now,
    };

    onSave(newRecord);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h3 className="text-sm font-semibold text-white">
            {record ? "编辑余额查询" : "创建余额查询"}
          </h3>
          <button onClick={onCancel} className={BUTTON_ICON_DANGER_SM_CLASS}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 标签名称 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">标签名称</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={FIELD_INPUT_CLASS}
              placeholder="例如：OpenAI 余额"
            />
          </div>

          {/* 登录配置 */}
          <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4 space-y-3">
            <h4 className="text-sm font-medium text-white flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20 text-[10px] text-indigo-400">1</span>
              登录配置
            </h4>

            <div>
              <label className="block text-xs text-gray-400 mb-1">登录 cURL</label>
              <textarea
                value={loginCurl}
                onChange={(e) => setLoginCurl(e.target.value)}
                className={`${FIELD_MONO_INPUT_CLASS} h-24 resize-none`}
                placeholder="粘贴登录请求的 cURL 命令..."
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleParseLoginCurl}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  解析 cURL
                </button>
                <button
                  onClick={handleTestLogin}
                  disabled={testingLogin}
                  className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  {testingLogin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  执行登录
                </button>
              </div>
            </div>

            {loginParsed && (
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-1">
                <p className="text-[11px] text-gray-500">解析结果</p>
                <p className="text-xs text-gray-300">{loginParsed.method} {loginParsed.url}</p>
                {Object.entries(loginParsed.headers).map(([k, v]) => (
                  <p key={k} className="text-[11px] text-gray-500">{k}: {v}</p>
                ))}
              </div>
            )}

            {loginPaths.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-2">选择 token 字段路径</label>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-gray-800 bg-gray-900/50 p-2">
                  {loginPaths.map((path) => {
                    const value = getValueByPath(loginResult, path);
                    const isSelected = tokenFieldPath === path;
                    return (
                      <button
                        key={path}
                        onClick={() => setTokenFieldPath(path)}
                        className={`w-full flex items-center justify-between rounded px-2 py-1.5 text-left transition-colors ${
                          isSelected
                            ? "bg-indigo-500/20 border border-indigo-500/30"
                            : "hover:bg-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && <Check className="h-3 w-3 text-indigo-400" />}
                          <span className="text-xs font-mono text-gray-300">{path}</span>
                        </div>
                        <span className="text-[11px] text-gray-500 truncate max-w-[200px]">
                          {formatValue(value)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 查询配置 */}
          <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4 space-y-3">
            <h4 className="text-sm font-medium text-white flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20 text-[10px] text-indigo-400">2</span>
              余额查询配置
            </h4>

            <div>
              <label className="block text-xs text-gray-400 mb-1">查询 cURL</label>
              <textarea
                value={queryCurl}
                onChange={(e) => setQueryCurl(e.target.value)}
                className={`${FIELD_MONO_INPUT_CLASS} h-24 resize-none`}
                placeholder="粘贴余额查询的 cURL 命令..."
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleParseQueryCurl}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  解析 cURL
                </button>
                <button
                  onClick={handleTestQuery}
                  disabled={testingQuery}
                  className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  {testingQuery ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  测试查询
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Token 占位符</label>
              <input
                value={tokenPlaceholder}
                onChange={(e) => setTokenPlaceholder(e.target.value)}
                className={FIELD_MONO_INPUT_CLASS}
                placeholder="例如：{{token}} 或 $TOKEN"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                在查询 cURL 中用此占位符标记 token 位置，执行时会自动替换
              </p>
            </div>

            {queryParsed && (
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-1">
                <p className="text-[11px] text-gray-500">解析结果</p>
                <p className="text-xs text-gray-300">{queryParsed.method} {queryParsed.url}</p>
                {Object.entries(queryParsed.headers).map(([k, v]) => (
                  <p key={k} className="text-[11px] text-gray-500">{k}: {v}</p>
                ))}
              </div>
            )}

            {queryPaths.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-2">选择要展示的字段</label>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-gray-800 bg-gray-900/50 p-2">
                  {queryPaths.map((path) => {
                    const value = getValueByPath(queryResult, path);
                    const isSelected = displayFields.includes(path);
                    return (
                      <button
                        key={path}
                        onClick={() => toggleDisplayField(path)}
                        className={`w-full flex items-center justify-between rounded px-2 py-1.5 text-left transition-colors ${
                          isSelected
                            ? "bg-emerald-500/20 border border-emerald-500/30"
                            : "hover:bg-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && <Check className="h-3 w-3 text-emerald-400" />}
                          <span className="text-xs font-mono text-gray-300">{path}</span>
                        </div>
                        <span className="text-[11px] text-gray-500 truncate max-w-[200px]">
                          {formatValue(value)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border-subtle p-4 flex justify-end gap-2">
          <button onClick={onCancel} className={`${BUTTON_GHOST_CLASS} ${BUTTON_SIZE_SM_CLASS}`}>
            取消
          </button>
          <button onClick={handleSave} className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}>
            保存
          </button>
        </div>
      </Card>
    </div>
  );
}
