import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { AgentCanvas } from "../canvas/AgentCanvas";

interface AuditEntry {
  id: string; capability: string; tool_name: string;
  outcome: string; reason: string | null; occurred_at: number;
}

export function InvestigationScreen() {
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  useEffect(() => {
    invoke<AuditEntry[]>("get_audit_log", { limit: 50 })
      .then(setAuditLog)
      .catch(console.error);
  }, []);

  const outcomeColor: Record<string, string> = {
    permitted: "text-green-400", blocked: "text-red-400", approved: "text-blue-400",
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Agent canvas — left panel */}
      <div className="flex w-1/2 flex-col border-r border-white/10">
        <AgentCanvas />
      </div>

      {/* Audit trail — right panel */}
      <div className="flex w-1/2 flex-col">
        <div className="border-b border-white/10 px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-white/50">Audit Trail</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-xs">
          {auditLog.length === 0 ? (
            <p className="py-8 text-center text-white/20">No activity yet</p>
          ) : (
            auditLog.map((entry) => (
              <div key={entry.id} className="rounded bg-white/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={outcomeColor[entry.outcome] ?? "text-white/40"}>
                    {entry.outcome.toUpperCase()}
                  </span>
                  <span className="text-white/70">{entry.tool_name}</span>
                  <span className="text-white/30">{entry.capability}</span>
                  <span className="ml-auto text-white/20">
                    {new Date(entry.occurred_at).toLocaleTimeString()}
                  </span>
                </div>
                {entry.reason && (
                  <p className="mt-0.5 text-white/30">{entry.reason}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
