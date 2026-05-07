import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { openDb } from "../../db/client.js";
import { toolToCapability, requiresApproval } from "./capability-map.js";
import { sessionHasCapability, getSessionConfig } from "./session-caps.js";
import { appendAuditEntry, setAuditSessionId } from "./audit-log.js";

export function registerBroker(pi: ExtensionAPI): void {
  // ── Set audit session ID on start ──────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (sessionFile) setAuditSessionId(sessionFile);
  });

  // ── Inject current capability set into system prompt ───────────────────────
  pi.on("before_agent_start", async (_event, ctx) => {
    const config = getSessionConfig();
    const capList = config.capabilities
      .filter((c) => c !== "_internal")
      .map((c) => `  - ${c}`)
      .join("\n");

    return {
      systemPrompt:
        ctx.getSystemPrompt() +
        `\n\n## Session capabilities\n\nThis session is operating as: **${config.identity}**\n\nGranted capabilities:\n${capList}\n\nDo not attempt actions outside these capabilities.`,
    };
  });

  // ── Gate every tool call ────────────────────────────────────────────────────
  pi.on("tool_call", async (event, ctx) => {
    const capability = toolToCapability(event.toolName);

    // Unknown tool — block it.
    if (capability === null) {
      const db = openDb();
      appendAuditEntry(db, "unknown", event.toolName, event.input, "blocked", "No capability mapping");
      return { block: true, reason: `Tool "${event.toolName}" has no capability mapping and is blocked.` };
    }

    // Internal tools — always permitted, no audit entry needed.
    if (capability === "_internal") return;

    // Check session has the required capability.
    if (!sessionHasCapability(capability)) {
      const db = openDb();
      appendAuditEntry(db, capability, event.toolName, event.input, "blocked", "Capability not granted");
      return {
        block: true,
        reason: `Capability "${capability}" is not granted for this session.`,
      };
    }

    // Approval-required capabilities prompt the operator.
    if (requiresApproval(capability)) {
      const ok = await ctx.ui.confirm(
        `Approval required — ${capability}`,
        `Tool: ${event.toolName}\nArgs:\n${JSON.stringify(event.input, null, 2)}`,
      );
      const db = openDb();
      if (!ok) {
        appendAuditEntry(db, capability, event.toolName, event.input, "blocked", "Denied by operator");
        return { block: true, reason: "Denied by operator." };
      }
      appendAuditEntry(db, capability, event.toolName, event.input, "approved");
      return;
    }

    // Permitted — log and allow.
    const db = openDb();
    appendAuditEntry(db, capability, event.toolName, event.input, "permitted");
  });
}
