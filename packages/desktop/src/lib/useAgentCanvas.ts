import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore, type UiDescriptor } from "../store";

/**
 * Subscribe to agent-canvas UI descriptor events emitted by the Tauri backend.
 * Called once at app root level.
 */
export function useAgentCanvas() {
  const pushDescriptor = useAppStore((s) => s.pushDescriptor);
  const setSidecarReady = useAppStore((s) => s.setSidecarReady);

  useEffect(() => {
    const unlisten1 = listen<{ descriptor: UiDescriptor }>("agent-ui", (event) => {
      pushDescriptor(event.payload.descriptor);
    });

    const unlisten2 = listen<{ ready: boolean }>("sidecar-status", (event) => {
      setSidecarReady(event.payload.ready);
    });

    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
    };
  }, [pushDescriptor, setSidecarReady]);
}
