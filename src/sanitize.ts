export const MAX_SEARCH_QUERY_CHARS = 2048;
export const MAX_CONVERSATION_MESSAGE_CHARS = 8192;

const MEMORY_BLOCK_PATTERNS = [
  /<tenant-memory-context>[\s\S]*?<\/tenant-memory-context>/gi,
  /<relevant-memories>[\s\S]*?<\/relevant-memories>/gi,
  /<user-persona>[\s\S]*?<\/user-persona>/gi,
  /<relevant-scenes>[\s\S]*?<\/relevant-scenes>/gi,
  /<scene-navigation>[\s\S]*?<\/scene-navigation>/gi,
  /<memory-tools-guide>[\s\S]*?<\/memory-tools-guide>/gi,
];

export function sanitizeCapturedText(text: string): string {
  let cleaned = text;

  for (const pattern of MEMORY_BLOCK_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  cleaned = cleaned
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "[image]")
    .replace(/\0/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

export function stripCodeBlocks(text: string): string {
  return text
    .replace(/```[^\n]*\n[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeSearchQuery(raw: string, maxChars = MAX_SEARCH_QUERY_CHARS): string {
  const cleaned = sanitizeCapturedText(raw);
  if (!cleaned) return "";

  const stripped = stripCodeBlocks(cleaned);
  const candidate = stripped.trim().length > 0 ? stripped.trim() : cleaned;
  return candidate.slice(0, maxChars).trim();
}

const TRIVIAL_PROMPT_PATTERN =
  /^(ok|okay|yes|y|no|n|good|thanks|thank you|continue|next|run|go|sure|好|好的|好勒|行|可以|收到|继续|接着|继续吧|冲|干|嗯|哦|对|是的|1|0)$/i;

/** Check if a prompt is trivial or navigational (acknowledgments, continuations) where semantic memory search adds no value. */
export function isTrivialPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length <= 1) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(trimmed)) return true;
  return TRIVIAL_PROMPT_PATTERN.test(trimmed);
}

export function shouldCaptureText(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (value.startsWith("/")) return false;
  if (value === "(session bootstrap)") return false;
  if (value.startsWith("A new session was started via")) return false;
  if (/^NO_REPLY\s*$/.test(value)) return false;
  return true;
}
