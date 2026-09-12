import type { CaptureBatch, CaptureMessage, CursorData } from "./types.js";
import { MAX_CONVERSATION_MESSAGE_CHARS, sanitizeCapturedText, shouldCaptureText, stripCodeBlocks } from "./sanitize.js";

export const CURSOR_ENTRY_TYPE = "tdai-memory-cursor";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value != null && typeof value === "object" ? (value as UnknownRecord) : undefined;
}

export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      const block = asRecord(part);
      return block?.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function isMessageEntry(entry: unknown): entry is UnknownRecord & { id: string; message: UnknownRecord } {
  const record = asRecord(entry);
  const message = asRecord(record?.message);
  return record?.type === "message" && typeof record.id === "string" && message != null;
}

function isConversationRole(role: unknown): role is "user" | "assistant" {
  return role === "user" || role === "assistant";
}

export function findLastConversationMessageId(entries: unknown[]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (isMessageEntry(entry) && isConversationRole(entry.message.role)) return entry.id;
  }
  return undefined;
}

export function restoreCursor(entries: unknown[]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = asRecord(entries[index]);
    if (entry?.type !== "custom" || entry.customType !== CURSOR_ENTRY_TYPE) continue;
    const data = asRecord(entry.data);
    if (typeof data?.lastMessageEntryId === "string") return data.lastMessageEntryId;
  }

  // Installing the extension into an existing session starts capture from now,
  // rather than uploading the entire historical pi transcript unexpectedly.
  return findLastConversationMessageId(entries);
}

export function buildSessionId(prefix: string, sessionId: string): string {
  const cleanPrefix = prefix.trim().replace(/:+$/g, "");
  return cleanPrefix ? `${cleanPrefix}:${sessionId}` : sessionId;
}

export function collectCaptureBatch(
  entries: unknown[],
  cursorEntryId: string | undefined,
  stripAssistantCode: boolean,
): CaptureBatch {
  const cursorIndex = cursorEntryId ? entries.findIndex((entry) => asRecord(entry)?.id === cursorEntryId) : -1;
  const candidates = entries.slice(cursorIndex + 1);
  const messages: CaptureMessage[] = [];
  let lastMessageEntryId: string | undefined;
  let hasSuccessfulAssistant = false;

  for (const entry of candidates) {
    if (!isMessageEntry(entry)) continue;
    const role = entry.message.role;
    if (!isConversationRole(role)) continue;

    lastMessageEntryId = entry.id;
    if (role === "assistant") {
      const stopReason = entry.message.stopReason;
      if (stopReason !== "error" && stopReason !== "aborted") hasSuccessfulAssistant = true;
    }

    let content = sanitizeCapturedText(extractTextContent(entry.message.content));
    if (role === "assistant" && stripAssistantCode) content = stripCodeBlocks(content);
    if (!shouldCaptureText(content)) continue;
    if (content.length > MAX_CONVERSATION_MESSAGE_CHARS) {
      content = content.slice(0, MAX_CONVERSATION_MESSAGE_CHARS).trim();
      if (!content) continue;
    }

    const rawTimestamp = entry.message.timestamp;
    const timestampMs = typeof rawTimestamp === "number" && Number.isFinite(rawTimestamp)
      ? rawTimestamp
      : Date.parse(String(asRecord(entry)?.timestamp ?? ""));

    messages.push({
      role,
      content,
      timestamp: new Date(Number.isFinite(timestampMs) ? timestampMs : Date.now()).toISOString(),
    });
  }

  return { messages, lastMessageEntryId, hasSuccessfulAssistant };
}

export function makeCursorData(lastMessageEntryId: string, remoteTotalCount?: number): CursorData {
  return {
    lastMessageEntryId,
    capturedAt: new Date().toISOString(),
    ...(remoteTotalCount == null ? {} : { remoteTotalCount }),
  };
}
