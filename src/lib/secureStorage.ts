/**
 * 安全存储工具 — 使用 AES-GCM 加密敏感字段（如 API Key）。
 *
 * 加密密钥在首次启动时随机生成，持久化到 localStorage（非 Tauri）或
 * Tauri SQL 的独立 kv_store 行中。密文以 "enc:v1:" 前缀存储，
 * 未加密的明文数据会自动迁移。
 */
import { loadPersistedJson, savePersistedJson } from "./persistence";

const ENC_KEY_DB_KEY = "__secure_storage_key__";
const ENC_KEY_LS_KEY = "ai-modal-secure-storage-key";
const ENC_PREFIX = "enc:v1:";

let cachedKey: CryptoKey | null = null;

function toArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64(raw);
}

async function importKey(base64: string): Promise<CryptoKey> {
  const raw = toArrayBuffer(base64);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * 获取或创建加密密钥。密钥持久化在 DB 中，首次使用时自动生成。
 */
export async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  try {
    const stored = await loadPersistedJson<string>(
      ENC_KEY_DB_KEY,
      ENC_KEY_LS_KEY,
      "",
    );
    if (stored) {
      cachedKey = await importKey(stored);
      return cachedKey;
    }
  } catch {
    // 密钥不存在，继续生成新的
  }

  const key = await generateKey();
  const exported = await exportKey(key);
  cachedKey = key;

  try {
    await savePersistedJson(ENC_KEY_DB_KEY, exported, ENC_KEY_LS_KEY);
  } catch {
    // 非关键失败 — 下次启动会重新生成
  }

  return key;
}

/**
 * 加密一个明文字符串。返回带 "enc:v1:" 前缀的密文。
 * 如果输入为空，原样返回。
 */
export async function encryptField(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;
  if (plaintext.startsWith(ENC_PREFIX)) return plaintext; // 已加密

  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  // 格式: enc:v1:<iv_base64>.<ciphertext_base64>
  return `${ENC_PREFIX}${toBase64(iv.buffer)}.${toBase64(ciphertext)}`;
}

/**
 * 解密一个带 "enc:v1:" 前缀的密文。如果不是加密格式，原样返回（兼容迁移）。
 */
export async function decryptField(ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext;

  const payload = ciphertext.slice(ENC_PREFIX.length);
  const dotIndex = payload.indexOf(".");
  if (dotIndex === -1) return ciphertext; // 格式无效，原样返回

  const ivBase64 = payload.slice(0, dotIndex);
  const ctBase64 = payload.slice(dotIndex + 1);

  try {
    const key = await getOrCreateEncryptionKey();
    const iv = toArrayBuffer(ivBase64);
    const ct = toArrayBuffer(ctBase64);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ct,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    // 解密失败（密钥变更等），返回原文让调用方处理
    console.warn("[secureStorage] 解密失败，可能密钥已变更");
    return ciphertext;
  }
}

/**
 * 检查一个值是否已加密。
 */
export function isEncrypted(value: string): boolean {
  return value != null && value.startsWith(ENC_PREFIX);
}
