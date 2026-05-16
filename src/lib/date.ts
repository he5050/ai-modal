const LOCALE = "zh-CN";

export function formatDateTime(
  ts: number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString(LOCALE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  });
}

export function formatDateShort(
  ts: number | Date | null | undefined,
): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString(LOCALE, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatTime(
  ts: number | Date | null | undefined,
): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString(LOCALE, { hour12: false });
}

export function formatFullDate(
  ts: number | Date | null | undefined,
): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString(LOCALE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(ts: number | Date | null | undefined): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : new Date(ts);
  const now = Date.now();
  const diff = now - d.getTime();

  if (diff < 0) return "刚刚";
  if (diff < MINUTE) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;

  return formatDateShort(ts);
}
