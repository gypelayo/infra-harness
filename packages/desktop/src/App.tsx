import { useAppStore, type Screen } from "./store";
import { useAgentCanvas } from "./lib/useAgentCanvas";
import { TopologyScreen } from "./screens/TopologyScreen";
import { InvestigationScreen } from "./screens/InvestigationScreen";
import { PermissionsScreen } from "./screens/PermissionsScreen";
import { KnowledgeScreen } from "./screens/KnowledgeScreen";

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: "topology",      label: "Topology",      icon: "◈" },
  { id: "investigation", label: "Investigation",  icon: "⟳" },
  { id: "permissions",   label: "Permissions",    icon: "◐" },
  { id: "knowledge",     label: "Knowledge",      icon: "◉" },
];

function App() {
  useAgentCanvas();

  const activeScreen  = useAppStore((s) => s.activeScreen);
  const setScreen     = useAppStore((s) => s.setScreen);
  const sidecarReady  = useAppStore((s) => s.sidecarReady);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d1a] text-white font-sans">
      {/* Sidebar nav */}
      <nav className="flex w-48 flex-col border-r border-white/10 bg-black/20">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-white">infra-harness</span>
        </div>
        <div className="flex flex-col gap-0.5 p-2 flex-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                activeScreen === item.id
                  ? "bg-blue-600/30 text-blue-300"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        {/* Sidecar status */}
        <div className="border-t border-white/10 px-4 py-2 flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${sidecarReady ? "bg-green-400" : "bg-white/20"}`} />
          <span className="text-xs text-white/30">{sidecarReady ? "pi connected" : "pi offline"}</span>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeScreen === "topology"      && <TopologyScreen />}
        {activeScreen === "investigation" && <InvestigationScreen />}
        {activeScreen === "permissions"   && <PermissionsScreen />}
        {activeScreen === "knowledge"     && <KnowledgeScreen />}
      </main>
    </div>
  );
}

export default App;
