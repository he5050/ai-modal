const URL_PATTERN = /^https?:\/\/.+/i;

export function isUrl(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  return URL_PATTERN.test(value.trim());
}

export function isEmpty(value: string | null | undefined): boolean {
  if (value == null) return true;
  return String(value).trim().length === 0;
}

export function validateRequired(
  value: string | null | undefined,
  fieldName: string = "此字段",
): string | null {
  if (isEmpty(value)) return `${fieldName}不能为空`;
  return null;
}

export function validateUrl(
  value: string | null | undefined,
  fieldName: string = "URL",
): string | null {
  const emptyError = validateRequired(value, fieldName);
  if (emptyError) return emptyError;
  if (!isUrl(value)) return `请输入完整 ${fieldName}（以 http:// 或 https:// 开头）`;
  return null;
}

export function isValidApiKey(value: string | null | undefined): boolean {
  if (isEmpty(value)) return false;
  const trimmed = (value ?? "").trim();
  return trimmed.length >= 8;
}

export function maskString(value: string, visibleChars = 2): string {
  if (!value) return "—";
  if (value.length <= visibleChars * 2) return "*".repeat(value.length);
  return (
    value.slice(0, visibleChars) +
    "******" +
    value.slice(-visibleChars)
  );
}

export function truncate(str: string, maxLength: number, suffix = "..."): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}
