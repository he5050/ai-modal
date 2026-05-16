/**
 * 一次性解密迁移工具。
 * 将 enc:v1: 开头的加密 API Key 还原为明文，然后回写数据库。
 * 全部逻辑内聚，不依赖已删除的 secureStorage.ts。
 */
import { loadPersistedJson, savePersistedJson } from "./persistence";

const ENC_KEY_DB_KEY = "__secure_storage_key__";
const ENC_KEY_LS_KEY = "ai-modal-secure-storage-key";
const ENC_PREFIX = "enc:v1:";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

async function aesGcmDecrypt(ciphertextB64: string, ivB64: string, key: CryptoKey): Promise<string> {
  const iv = base64ToArrayBuffer(ivB64);
  const ct = base64ToArrayBuffer(ciphertextB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

function importAesKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(base64),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

function decryptValue(val: string, key: CryptoKey): Promise<string> {
  if (!val || !val.startsWith(ENC_PREFIX)) return Promise.resolve(val);
  const payload = val.slice(ENC_PREFIX.length);
  const dot = payload.indexOf(".");
  if (dot === -1) return Promise.resolve(val);
  return aesGcmDecrypt(payload.slice(dot + 1), payload.slice(0, dot), key).catch(() => val);
}

/**
 * 对 providers 数据做一次性解密。
 * 返回已解密的数据数组（即使没有加密也会正常返回原始数据）。
 */
export async function decryptProviders(raw: unknown[]): Promise<unknown[]> {
  // 是否有需要解密的字段
  const hasEncrypted = raw.some((item) => {
    if (typeof item !== "object" || item === null) return false;
    const r = item as Record<string, unknown>;
    return typeof r.apiKey === "string" && (r.apiKey as string).startsWith(ENC_PREFIX);
  });

  if (!hasEncrypted) return raw;

  console.warn("[migration] 检测到加密 API Key，正在解密还原...");

  // 读取加密密钥
  let keyBase64 = "";
  try {
    keyBase64 = await loadPersistedJson<string>(ENC_KEY_DB_KEY, ENC_KEY_LS_KEY, "");
  } catch { /* ignore */ }

  if (!keyBase64) {
    console.error("[migration] 找不到加密密钥，无法解密");
    return raw;
  }

  const key = await importAesKey(keyBase64);

  // 逐条解密
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.apiKey === "string" && (r.apiKey as string).startsWith(ENC_PREFIX)) {
      r.apiKey = await decryptValue(r.apiKey as string, key);
    }
  }

  // 明文回写
  await savePersistedJson("providers", raw, "ai-modal-providers");

  // 清理加密密钥
  try {
    await savePersistedJson(ENC_KEY_DB_KEY, "", ENC_KEY_LS_KEY);
    localStorage.removeItem(ENC_KEY_LS_KEY);
  } catch { /* ignore */ }

  console.warn("[migration] API Key 已全部还原为明文");
  return raw;
}
