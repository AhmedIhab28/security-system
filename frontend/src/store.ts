import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Lang, translations, T } from "./i18n";

export interface LiveAlert {
  id?: number;
  type: string;
  title: string;
  message: string;
  camera_name?: string;
  location?: string;
  building?: string;
  snapshot?: string;
  timestamp: string;
  alert_id?: number;
  visitor_log_id?: number;
  visitor_name?: string;
}

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: "super_admin" | "building_admin" | "gate" | "building" | "resident";
  building_group_id: number;
  assigned_building_id: number | null;
  admin_building_id: number | null;
}

interface AppState {
  lang: Lang;
  t: T;
  setLang: (lang: Lang) => void;
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  liveAlerts: LiveAlert[];
  pushAlert: (alert: LiveAlert) => void;
  clearAlert: (alert_id: number) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      lang: "en",
      t: translations.en,
      setLang: (lang) => set({ lang, t: translations[lang] }),
      user: null,
      setUser: (user) => set({ user }),
      liveAlerts: [],
      pushAlert: (alert) =>
        set((s) => ({ liveAlerts: [alert, ...s.liveAlerts].slice(0, 50) })),
      clearAlert: (alert_id) =>
        set((s) => ({ liveAlerts: s.liveAlerts.filter((a) => a.alert_id !== alert_id) })),
    }),
    { name: "securewatch-store", partialize: (s) => ({ lang: s.lang }) }
  )
);
