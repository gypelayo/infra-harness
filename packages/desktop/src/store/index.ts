import { create } from "zustand";

export type Screen = "topology" | "investigation" | "permissions" | "knowledge";

export interface UiDescriptor {
  type: string;
  [key: string]: unknown;
}

interface AppState {
  activeScreen: Screen;
  canvasDescriptors: Array<{ id: string; ts: string; descriptor: UiDescriptor }>;
  sidecarReady: boolean;
  setScreen: (screen: Screen) => void;
  pushDescriptor: (descriptor: UiDescriptor) => void;
  clearCanvas: () => void;
  setSidecarReady: (ready: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeScreen: "topology",
  canvasDescriptors: [],
  sidecarReady: false,
  setScreen: (screen) => set({ activeScreen: screen }),
  pushDescriptor: (descriptor) =>
    set((state) => ({
      canvasDescriptors: [
        ...state.canvasDescriptors,
        { id: crypto.randomUUID(), ts: new Date().toISOString(), descriptor },
      ],
    })),
  clearCanvas: () => set({ canvasDescriptors: [] }),
  setSidecarReady: (ready) => set({ sidecarReady: ready }),
}));
