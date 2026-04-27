import { createEmptyPrompt } from "../../lib/promptStore";
import type { PromptRecord } from "../../types";

export function summarizePromptContent(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

export function formatPromptTime(timestamp: number | null) {
  if (timestamp == null) return "暂无更新";
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

export function createDraft(prompt: PromptRecord | null) {
  return prompt ? { ...prompt } : createEmptyPrompt(Date.now(), []);
}

export function serializeDraftComparable(record: PromptRecord) {
  return JSON.stringify({
    id: record.id,
    title: record.title,
    content: record.content,
    tags: record.tags,
  });
}
