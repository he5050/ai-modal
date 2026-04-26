export function summarizePromptContent(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

export function formatPromptTime(timestamp: number | null) {
  if (timestamp == null) return "暂无更新";
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}
