import { create } from "zustand";

type SystemState = {
  apiUnreachable: boolean;
  setApiUnreachable: (value: boolean) => void;
};

export const useSystemStore = create<SystemState>((set) => ({
  apiUnreachable: false,
  setApiUnreachable: (value) => set({ apiUnreachable: value })
}));
