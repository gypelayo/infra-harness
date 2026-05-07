import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

export interface SessionConfig {
  capabilities: string[];
  identity: string;
}

const DEFAULT_READ_ONLY_CAPS = [
  "cloud.read.resources",
  "cloud.read.metrics",
  "cloud.read.logs",
  "k8s.read.workloads",
  "k8s.read.logs",
  "repo.read.code",
  "_internal",
];

let _config: SessionConfig | null = null;

function loadConfig(): SessionConfig {
  const configPath = process.env.INFRA_HARNESS_CONFIG
    ?? join(homedir(), ".infra-harness", "config.json");

  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Partial<SessionConfig>;
      return {
        capabilities: raw.capabilities ?? DEFAULT_READ_ONLY_CAPS,
        identity:     raw.identity     ?? process.env.USER ?? "unknown",
      };
    } catch {
      // Fall through to defaults.
    }
  }

  return {
    capabilities: DEFAULT_READ_ONLY_CAPS,
    identity:     process.env.USER ?? "unknown",
  };
}

export function getSessionConfig(): SessionConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

export function sessionHasCapability(capability: string): boolean {
  if (capability === "_internal") return true;
  return getSessionConfig().capabilities.includes(capability);
}

/** Force reload (e.g. after /infra-config command changes the file). */
export function reloadConfig(): void {
  _config = null;
}
