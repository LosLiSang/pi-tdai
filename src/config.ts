import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ConfigLoadResult, MemoryConfig } from "./types.js";

type JsonObject = Record<string, unknown>;

const DEFAULT_CONFIG: MemoryConfig = {
  enabled: true,
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
    enabled: parseBoolean(env.TDAI_MEMORY_ENABLED),
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
    enabled: booleanValue(raw.enabled, DEFAULT_CONFIG.enabled),
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

export const CONFIG_FILE_NAME = "tencentdb-agent-memory.json";

export async function loadMemoryConfig(
  cwd: string,
  projectTrusted: boolean,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ConfigLoadResult> {
  const globalPath = join(getAgentDir(), CONFIG_FILE_NAME);
  const projectPath = join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
  const sources: string[] = [];
  const diagnostics: string[] = [];
  let merged: JsonObject = DEFAULT_CONFIG as unknown as JsonObject;
  let configured = false;

  // 1. Global config (~/.pi/agent/tencentdb-agent-memory.json) as the base.
  //    It is user-owned, so it is read regardless of project trust and acts
  //    as the fallback for any pi project without a local override.
  const global = await readJsonObject(globalPath);
  if (global.found) sources.push(globalPath);
  if (global.error) diagnostics.push(global.error);
  if (global.value) {
    configured = true;
    merged = mergeConfig(merged, global.value);
  }

  // 2. Project config (<cwd>/.pi/tencentdb-agent-memory.json) overrides the
  //    global one. Only read when the project is trusted — pi's safety
  //    boundary prevents untrusted projects from injecting settings.
  if (projectTrusted) {
    const project = await readJsonObject(projectPath);
    if (project.found) sources.push(projectPath);
    if (project.error) diagnostics.push(project.error);
    if (project.value) {
      configured = true;
      merged = mergeConfig(merged, project.value);
    }
  }

  // 3. Environment variables override file config (useful for secrets), but
  //    only when a file config opted in (global or project). Env alone must
  //    not activate the plugin for arbitrary projects.
  if (configured) {
    const envConfig = environmentConfig(env);
    if (Object.keys(envConfig).length > 0) {
      sources.push("environment");
      merged = mergeConfig(merged, envConfig);
    }
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
    globalPath: join(getAgentDir(), CONFIG_FILE_NAME),
    projectPath: join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME),
  };
}

// ===========================================================================
// Config writing (for /tdai-memory-config)
// ===========================================================================

export type ConfigScope = "project" | "global";

const NUMERIC_KEYS = new Set([
  "timeoutMs",
  "recall.maxResults",
  "recall.maxScenarios",
  "recall.maxContextChars",
]);

const BOOLEAN_KEYS = new Set([
  "tls.rejectUnauthorized",
  "recall.enabled",
  "recall.includePersona",
  "recall.includeScenarios",
  "capture.enabled",
  "capture.stripAssistantCodeBlocks",
]);

export function resolveConfigPath(cwd: string, scope: ConfigScope): string {
  return scope === "global"
    ? join(getAgentDir(), CONFIG_FILE_NAME)
    : join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

/** Decide which scope new config should be written to: project if a project
 * config file already exists, otherwise global. Based on file existence only,
 * independent of project trust (writing is a user-initiated action). */
export async function resolveWriteScope(cwd: string): Promise<ConfigScope> {
  const projectPath = join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
  const project = await readJsonObject(projectPath);
  return project.found ? "project" : "global";
}

/** Coerce a raw string value based on the (dotted) key's expected type.
 * Unknown keys are kept as strings, so a numeric userId like "5301323504"
 * is preserved instead of being turned into a JSON number. */
export function coerceValue(dottedKey: string, raw: string): { value: unknown; error?: string } {
  if (NUMERIC_KEYS.has(dottedKey)) {
    if (!/^-?\d+(\.\d+)?$/.test(raw)) {
      return { value: raw, error: `${dottedKey} 应为数字，收到 "${raw}"` };
    }
    return { value: Number(raw) };
  }
  if (BOOLEAN_KEYS.has(dottedKey)) {
    const lower = raw.toLowerCase();
    if (["1", "true", "yes", "on"].includes(lower)) return { value: true };
    if (["0", "false", "no", "off"].includes(lower)) return { value: false };
    return { value: raw, error: `${dottedKey} 应为布尔值(true/false)，收到 "${raw}"` };
  }
  return { value: raw };
}

// ===========================================================================
// Dotted-path helpers (shared by config loading, writing and the wizard)
// ===========================================================================

/** Read a value at a dotted path (e.g. "recall.maxResults"), or undefined. */
export function getNested(obj: unknown, dotted: string): unknown {
  const parts = dotted.split(".");
  let node: unknown = obj;
  for (const part of parts) {
    node = node != null && typeof node === "object" && !Array.isArray(node)
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }
  return node;
}

/** Assign a value into a nested object using a dotted key (e.g. "recall.maxResults"). */
export function assignNested(target: JsonObject, dottedKey: string, value: unknown): void {
  const parts = dottedKey.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!isObject(node[part])) node[part] = {};
    node = node[part] as JsonObject;
  }
  node[parts[parts.length - 1]] = value;
}

/** Flatten a nested object into dotted keys (e.g. { recall: { maxResults: 5 } } → ["recall.maxResults"]). */
export function dottedKeys(obj: JsonObject, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isObject(v)) keys.push(...dottedKeys(v, path));
    else keys.push(path);
  }
  return keys;
}

export interface SetConfigResult {
  scope: ConfigScope;
  path: string;
  created: boolean;
  appliedKeys: string[];
}

/** Merge `updates` into the scope's config file, preserving other fields. */
export async function setMemoryConfig(
  cwd: string,
  scope: ConfigScope,
  updates: JsonObject,
): Promise<SetConfigResult> {
  const path = resolveConfigPath(cwd, scope);
  const existing = await readJsonObject(path);
  if (existing.error) throw new Error(existing.error);

  const base = existing.value ?? {};
  const merged = mergeConfig(base, updates);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  return {
    scope,
    path,
    created: !existing.found,
    appliedKeys: dottedKeys(updates),
  };
}
