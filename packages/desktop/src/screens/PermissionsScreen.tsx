import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface Capability {
  name: string;
  granted: boolean;
  requires_approval: boolean;
}

interface AuditEntry {
  id: string; capability: string; tool_name: string;
  outcome: string; reason: string | null; occurred_at: number;
}

const ALL_CAPABILITIES: Capability[] = [
  { name: "cloud.read.resources",  granted: true,  requires_approval: false },
  { name: "cloud.read.metrics",    granted: true,  requires_approval: false },
  { name: "cloud.read.logs",       granted: true,  requires_approval: false },
  { name: "k8s.read.workloads",    granted: true,  requires_approval: false },
  { name: "k8s.read.logs",         granted: true,  requires_approval: false },
  { name: "repo.read.code",        granted: true,  requires_approval: false },
  { name: "deploy.restart.workload",granted: false, requires_approval: true  },
  { name: "repo.create.patch",     granted: false, requires_approval: true  },
  { name: "iac.diff.plan",         granted: false, requires_approval: true  },
];

export function PermissionsScreen() {
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  useEffect(() => {
    invoke<AuditEntry[]>("get_audit_log", { limit: 100 })
      .then(setAuditLog)
      .catch(console.error);
  }, []);

  const outcomeColor: Record<string, string> = {
    permitted: "text-green-400", blocked: "text-red-400", approved: "text-blue-400",
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6 gap-6">
      {/* Session identity */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Session Identity</h2>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white">Read-only investigation session</p>
          <p className="text-xs text-white/40 mt-1">
            All write capabilities are restricted. No changes can be made to production systems.
          </p>
        </div>
      </section>

      {/* Capability grid */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Capabilities</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ALL_CAPABILITIES.map((cap) => (
            <div
              key={cap.name}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                cap.granted
                  ? "border-green-700/50 bg-green-900/20"
                  : cap.requires_approval
                  ? "border-yellow-700/50 bg-yellow-900/20"
                  : "border-white/10 bg-white/5 opacity-40"
              }`}
            >
              <span className={cap.granted ? "text-green-400" : cap.requires_approval ? "text-yellow-400" : "text-white/20"}>
                {cap.granted ? "●" : cap.requires_approval ? "◐" : "○"}
              </span>
              <span className={`font-mono ${cap.granted ? "text-white" : "text-white/40"}`}>{cap.name}</span>
              {cap.requires_approval && (
                <span className="ml-auto text-xs text-yellow-500">approval required</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Audit log */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Recent Actions</h2>
        <div className="rounded-lg border border-white/10 overflow-hidden">
          {auditLog.length === 0 ? (
            <p className="p-4 text-sm text-white/20 text-center">No actions recorded yet</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/30 text-left">
                  <th className="px-3 py-2">Outcome</th>
                  <th className="px-3 py-2">Tool</th>
                  <th className="px-3 py-2">Capability</th>
                  <th className="px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.slice(0, 30).map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className={`px-3 py-1.5 font-mono ${outcomeColor[entry.outcome] ?? "text-white/40"}`}>
                      {entry.outcome}
                    </td>
                    <td className="px-3 py-1.5 text-white/70 font-mono">{entry.tool_name}</td>
                    <td className="px-3 py-1.5 text-white/40">{entry.capability}</td>
                    <td className="px-3 py-1.5 text-white/30">
                      {new Date(entry.occurred_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
