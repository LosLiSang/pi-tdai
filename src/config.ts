import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ConfigLoadResult, MemoryConfig } from "./types.js";

type JsonObject = Record<string, unknown>;

const DEFAULT_CONFIG: MemoryConfig = {
  endpoint: "http://127.0.0.1:8420",
  apiKey: "",
  serviceId: "default",
  teamId: "",
  agentId: "",
  userId: "",
  taskId: undefined,
  sessionPrefix: "pi",
  timeoutMs: 10_000,
  tls: {
    rejectUnauthorized: true,
  },
  recall: {
    enabled: true,
    maxResults: 5,
    includePersona: true,
    includeScenarios: true,
    maxScenarios: 20,
    maxContextChars: 12_000,
  },
  capture: {
    enabled: true,
    stripAssistantCodeBlocks: true,
  },
};

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(base: JsonObject, override: JsonObject): JsonObject {
  const result: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isObject(value) && isObject(result[key])) {
      result[key] = mergeConfig(result[key] as JsonObject, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

async function readJsonObject(path: string): Promise<{ value?: JsonObject; error?: string; found: boolean }> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (!isObject(parsed)) return { found: true, error: `${path} 顶层必须是 JSON 对象` };
    return { found: true, value: parsed };
  } catch (error) {
    const code = isObject(error) && typeof error.code === "string" ? error.code : undefined;
    if (code === "ENOENT") return { found: false };
    return {
      found: true,
      error: `${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value == null || value === "") return undefined;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactObject(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function environmentConfig(env: NodeJS.ProcessEnv): JsonObject {
  const tls = compactObject({
    rejectUnauthorized: parseBoolean(env.TDAI_MEMORY_TLS_REJECT_UNAUTHORIZED),
  });
  const recall = compactObject({
    enabled: parseBoolean(env.TDAI_MEMORY_RECALL_ENABLED),
    maxResults: parseNumber(env.TDAI_MEMORY_RECALL_MAX_RESULTS),
    includePersona: parseBoolean(env.TDAI_MEMORY_INCLUDE_PERSONA),
    includeScenarios: parseBoolean(env.TDAI_MEMORY_INCLUDE_SCENARIOS),
    maxScenarios: parseNumber(env.TDAI_MEMORY_MAX_SCENARIOS),
    maxContextChars: parseNumber(env.TDAI_MEMORY_MAX_CONTEXT_CHARS),
  });
  const capture = compactObject({
    enabled: parseBoolean(env.TDAI_MEMORY_CAPTURE_ENABLED),
    stripAssistantCodeBlocks: parseBoolean(env.TDAI_MEMORY_STRIP_ASSISTANT_CODE),
  });

  return compactObject({
    endpoint: env.TDAI_MEMORY_ENDPOINT,
    apiKey: env.TDAI_MEMORY_API_KEY,
    serviceId: env.TDAI_MEMORY_INSTANCE_ID ?? env.TDAI_MEMORY_SERVICE_ID,
    teamId: env.TDAI_MEMORY_TEAM_ID,
    agentId: env.TDAI_MEMORY_AGENT_ID,
    userId: env.TDAI_MEMORY_USER_ID,
    taskId: env.TDAI_MEMORY_TASK_ID,
    sessionPrefix: env.TDAI_MEMORY_SESSION_PREFIX,
    timeoutMs: parseNumber(env.TDAI_MEMORY_TIMEOUT_MS),
    tls: Object.keys(tls).length > 0 ? tls : undefined,
    recall: Object.keys(recall).length > 0 ? recall : undefined,
    capture: Object.keys(capture).length > 0 ? capture : undefined,
  });
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeConfig(raw: JsonObject): MemoryConfig {
  const recall = isObject(raw.recall) ? raw.recall : {};
  const capture = isObject(raw.capture) ? raw.capture : {};
  const tls = isObject(raw.tls) ? raw.tls : {};

  const taskId = stringValue(raw.taskId);
  return {
    endpoint: stringValue(raw.endpoint, DEFAULT_CONFIG.endpoint).replace(/\/+$/, ""),
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    serviceId: stringValue(raw.serviceId, DEFAULT_CONFIG.serviceId),
    teamId: stringValue(raw.teamId),
    agentId: stringValue(raw.agentId),
    userId: stringValue(raw.userId),
    ...(taskId ? { taskId } : {}),
    sessionPrefix: stringValue(raw.sessionPrefix, DEFAULT_CONFIG.sessionPrefix),
    timeoutMs: boundedInteger(raw.timeoutMs, DEFAULT_CONFIG.timeoutMs, 1000, 120_000),
    tls: {
      rejectUnauthorized: booleanValue(tls.rejectUnauthorized, DEFAULT_CONFIG.tls.rejectUnauthorized),
    },
    recall: {
      enabled: booleanValue(recall.enabled, DEFAULT_CONFIG.recall.enabled),
      maxResults: boundedInteger(recall.maxResults, DEFAULT_CONFIG.recall.maxResults, 1, 20),
      includePersona: booleanValue(recall.includePersona, DEFAULT_CONFIG.recall.includePersona),
      includeScenarios: booleanValue(recall.includeScenarios, DEFAULT_CONFIG.recall.includeScenarios),
      maxScenarios: boundedInteger(recall.maxScenarios, DEFAULT_CONFIG.recall.maxScenarios, 0, 100),
      maxContextChars: boundedInteger(
        recall.maxContextChars,
        DEFAULT_CONFIG.recall.maxContextChars,
        1000,
        50_000,
      ),
    },
    capture: {
      enabled: booleanValue(capture.enabled, DEFAULT_CONFIG.capture.enabled),
      stripAssistantCodeBlocks: booleanValue(
        capture.stripAssistantCodeBlocks,
        DEFAULT_CONFIG.capture.stripAssistantCodeBlocks,
      ),
    },
  };
}

export async function loadMemoryConfig(
  cwd: string,
  projectTrusted: boolean,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ConfigLoadResult> {
  const globalPath = join(getAgentDir(), "tencentdb-agent-memory.json");
  const projectPath = join(cwd, CONFIG_DIR_NAME, "tencentdb-agent-memory.json");
  const sources: string[] = [];
  const diagnostics: string[] = [];
  let merged: JsonObject = DEFAULT_CONFIG as unknown as JsonObject;

  const global = await readJsonObject(globalPath);
  if (global.found) sources.push(globalPath);
  if (global.error) diagnostics.push(global.error);
  if (global.value) merged = mergeConfig(merged, global.value);

  if (projectTrusted) {
    const project = await readJsonObject(projectPath);
    if (project.found) sources.push(projectPath);
    if (project.error) diagnostics.push(project.error);
    if (project.value) merged = mergeConfig(merged, project.value);
  }

  const envConfig = environmentConfig(env);
  if (Object.keys(envConfig).length > 0) {
    sources.push("environment");
    merged = mergeConfig(merged, envConfig);
  }

  const config = normalizeConfig(merged);
  const missing = (["teamId", "agentId", "userId"] as const).filter((key) => !config[key]);

  try {
    const url = new URL(config.endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      diagnostics.push(`endpoint 只支持 http/https: ${config.endpoint}`);
    }
  } catch {
    diagnostics.push(`endpoint 不是有效 URL: ${config.endpoint}`);
  }

  return {
    config,
    sources,
    diagnostics,
    missing,
    valid: missing.length === 0 && diagnostics.length === 0,
  };
}

export function getConfigPaths(cwd: string): { globalPath: string; projectPath: string } {
  return {
    globalPath: join(getAgentDir(), "tencentdb-agent-memory.json"),
    projectPath: join(cwd, CONFIG_DIR_NAME, "tencentdb-agent-memory.json"),
  };
}
