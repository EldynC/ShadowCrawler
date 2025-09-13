import { create } from "zustand";

export interface OnboardingState {
  directoryPath: string | null;
  setDirectoryPath: (path: string) => void;
  completed: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  directoryPath: null,
  setDirectoryPath: (path: string) => set({ directoryPath: path }),
  completed: false,
  completeOnboarding: () => set({ completed: true }),
  resetOnboarding: () =>
    set({
      directoryPath: null,
      completed: false,
    }),
}));
