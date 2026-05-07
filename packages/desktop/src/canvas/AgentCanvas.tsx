import { useAppStore } from "../store";
import { DescriptorRenderer } from "./DescriptorRenderer";

export function AgentCanvas() {
  const descriptors = useAppStore((s) => s.canvasDescriptors);
  const clearCanvas = useAppStore((s) => s.clearCanvas);

  if (descriptors.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-white/20">Agent canvas — outputs appear here during an investigation</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wide">Agent Canvas</span>
        <button
          onClick={clearCanvas}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {descriptors.map((item) => (
          <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="mb-2 text-[10px] text-white/20 font-mono">{item.ts}</p>
            <DescriptorRenderer descriptor={item.descriptor} />
          </div>
        ))}
      </div>
    </div>
  );
}
