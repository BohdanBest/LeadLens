import { create } from "zustand";
import i18n from "@/i18n";

export type ThemeChoice = "system" | "light" | "dark";
export type UiLanguage = "uk" | "en";
export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}

interface ActiveConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const THEME_KEY = "leadlens-color-scheme";
const LANG_KEY = "leadlens-lang";

function readStoredTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === "light" || value === "dark") return value;
    return "system";
  } catch {
    return "system";
  }
}

function applyThemeToDocument(theme: ThemeChoice): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = theme === "system" ? "light dark" : theme;
  }
  try {
    if (theme === "system") {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, theme);
    }
  } catch {
    // Theme still applies even when storage is blocked
  }
}

function readStoredLanguage(): UiLanguage {
  const current = i18n.language;
  if (current === "en" || current === "uk") return current;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === "en" ? "en" : "uk";
  } catch {
    return "uk";
  }
}

let toastSeq = 0;

interface UiStoreState {
  theme: ThemeChoice;
  language: UiLanguage;
  mobileNavOpen: boolean;
  toasts: ToastItem[];
  confirmDialog: ActiveConfirm | null;
  setTheme: (theme: ThemeChoice) => void;
  setLanguage: (lang: UiLanguage) => void;
  setMobileNavOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
  notify: (payload: { tone?: ToastTone; title: string; description?: string; durationMs?: number }) => string;
  dismissToast: (id: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (accepted: boolean) => void;
}

const initialTheme = readStoredTheme();
applyThemeToDocument(initialTheme);

export const useUiStore = create<UiStoreState>((set, get) => ({
  theme: initialTheme,
  language: readStoredLanguage(),
  mobileNavOpen: false,
  toasts: [],
  confirmDialog: null,

  setTheme(theme) {
    applyThemeToDocument(theme);
    set({ theme });
  },

  setLanguage(language) {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
    try {
      localStorage.setItem(LANG_KEY, language);
    } catch {
      // ignore
    }
    set({ language });
  },

  setMobileNavOpen(open) {
    set({ mobileNavOpen: open });
  },

  toggleMobileNav() {
    set((state) => ({ mobileNavOpen: !state.mobileNavOpen }));
  },

  notify({ tone = "info", title, description, durationMs = 4500 }) {
    const id = `toast-${++toastSeq}-${Date.now()}`;
    set((state) => ({
      toasts: [...state.toasts.slice(-3), { id, tone, title, description, durationMs }],
    }));

    const docWithNotify = document as Document & { ariaNotify?: (msg: string) => void };
    if (typeof docWithNotify.ariaNotify === "function") {
      try {
        docWithNotify.ariaNotify(description ? `${title}. ${description}` : title);
      } catch {
        // Fallback live region handles announcement
      }
    }
    return id;
  },

  dismissToast(id) {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  confirm(options) {
    const existing = get().confirmDialog;
    if (existing) {
      existing.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      set({ confirmDialog: { ...options, resolve } });
    });
  },

  resolveConfirm(accepted) {
    const active = get().confirmDialog;
    if (!active) return;
    set({ confirmDialog: null });
    active.resolve(accepted);
  },
}));

// Sync theme and language changes across tabs via storage event
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY) {
      const next: ThemeChoice =
        event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system";
      const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
      if (meta) {
        meta.content = next === "system" ? "light dark" : next;
      }
      useUiStore.setState({ theme: next });
    } else if (event.key === LANG_KEY && (event.newValue === "uk" || event.newValue === "en")) {
      void i18n.changeLanguage(event.newValue);
      document.documentElement.lang = event.newValue;
      useUiStore.setState({ language: event.newValue });
    }
  });
}
