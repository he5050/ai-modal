/** 错误码到用户友好提示的映射 */
const ERROR_CODE_MAP: Record<string, string> = {
  fetchfailed: "网络连接失败，请检查网络或代理设置",
  econnrefused: "连接被拒绝，请检查 Base URL 是否正确",
  econnreset: "连接被重置，服务器可能已关闭连接",
  etimedout: "请求超时，服务器响应过慢",
  aborterror: "请求已取消",
  enotfound: "域名解析失败，请检查 URL 是否正确",
  enetunreachable: "网络不可达，请检查网络连接",
  eai_again: "DNS 查询失败，请检查网络或代理设置",
  certificatehasexpired: "证书已过期，请联系服务器管理员",
  unabletoverifythefirstcertificate: "证书验证失败，请检查 SSL 配置",
  selfsignedcertificate: "自签名证书，请添加信任或使用 HTTP",
  "socket hang up": "连接意外中断，请稍后重试",
};

export function getFriendlyErrorMessage(error: unknown): string {
  if (!error) return "未知错误";

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  for (const [keyword, hint] of Object.entries(ERROR_CODE_MAP)) {
    if (lower.includes(keyword)) {
      return `${hint}\n(${message})`;
    }
  }

  return message;
}
