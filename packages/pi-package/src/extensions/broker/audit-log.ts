import { randomUUID } from "node:crypto";
import type { Db } from "../../db/client.js";
import type { Capability } from "./capability-map.js";
import { getSessionConfig } from "./session-caps.js";

export interface AuditEntry {
  id: string;
  session_id: string;
  capability: Capability;
  tool_name: string;
  tool_args: string;
  outcome: "permitted" | "blocked" | "approved";
  reason: string | null;
  operator: string | null;
  occurred_at: number;
}

let _sessionId = "unknown";

export function setAuditSessionId(id: string): void {
  _sessionId = id;
}

export function appendAuditEntry(
  db: Db,
  capability: Capability,
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolArgs: any,
  outcome: AuditEntry["outcome"],
  reason?: string,
): void {
  const entry: AuditEntry = {
    id:          randomUUID(),
    session_id:  _sessionId,
    capability,
    tool_name:   toolName,
    tool_args:   JSON.stringify(toolArgs ?? {}),
    outcome,
    reason:      reason ?? null,
    operator:    getSessionConfig().identity,
    occurred_at: Date.now(),
  };

  try {
    db.prepare(`
      INSERT INTO audit_log
        (id, session_id, capability, tool_name, tool_args, outcome, reason, operator, occurred_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id, entry.session_id, entry.capability, entry.tool_name,
      entry.tool_args, entry.outcome, entry.reason, entry.operator, entry.occurred_at,
    );
  } catch (err) {
    // Audit failures should never crash the session.
    console.error("[audit] Failed to write audit entry:", err);
  }
}
