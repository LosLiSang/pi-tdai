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

export function shouldCaptureText(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (value.startsWith("/")) return false;
  if (value === "(session bootstrap)") return false;
  if (value.startsWith("A new session was started via")) return false;
  if (/^NO_REPLY\s*$/.test(value)) return false;
  return true;
}
