import { create } from "zustand";
import { api, type AuthResponse, registerTokenProvider } from "@/api/client";
import { queryClient } from "@/api/queryClient";

export interface AuthSession {
  accessToken: string;
  userId: string;
  email: string;
  workspaceId: string;
}

// Clear any legacy localStorage tokens from older builds (XSS hardening)
try {
  localStorage.removeItem("leadlens-auth");
} catch {
  // Ignore storage restrictions
}

function toSession(auth: AuthResponse): AuthSession {
  return {
    accessToken: auth.accessToken,
    userId: auth.userId,
    email: auth.email,
    workspaceId: auth.workspaceId,
  };
}

let bootstrapPromise: Promise<void> | null = null;

interface AuthStoreState {
  session: AuthSession | null;
  bootstrapped: boolean;
  setSessionFromAuth: (auth: AuthResponse) => void;
  clearSession: () => void;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, studioName?: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  session: null,
  bootstrapped: false,

  setSessionFromAuth(auth) {
    set({ session: toSession(auth), bootstrapped: true });
  },

  clearSession() {
    set({ session: null, bootstrapped: true });
    queryClient.clear();
  },

  async bootstrap() {
    if (get().bootstrapped) return;
    if (!bootstrapPromise) {
      bootstrapPromise = (async () => {
        try {
          const auth = await api.refreshSession();
          set({ session: toSession(auth), bootstrapped: true });
        } catch {
          set({ session: null, bootstrapped: true });
        } finally {
          bootstrapPromise = null;
        }
      })();
    }
    await bootstrapPromise;
  },

  async login(email, password) {
    const auth = await api.login(email, password);
    get().setSessionFromAuth(auth);
  },

  async register(email, password, studioName) {
    const auth = await api.register(email, password, studioName);
    get().setSessionFromAuth(auth);
  },

  async changePassword(currentPassword, newPassword) {
    const auth = await api.changePassword(currentPassword, newPassword);
    get().setSessionFromAuth(auth);
  },

  async logout() {
    try {
      await api.logout();
    } catch {
      // Clear local session regardless of network errors
    }
    get().clearSession();
  },

  async logoutAll() {
    await api.logoutAll();
    get().clearSession();
  },

  async deleteAccount() {
    await api.deleteAccount();
    get().clearSession();
  },
}));

// Register synchronously at module load so access token is always available in memory.
registerTokenProvider(() => {
  const state = useAuthStore.getState();
  return {
    accessToken: state.session?.accessToken ?? null,
    onTokensUpdated: (auth) => state.setSessionFromAuth(auth),
    onAuthCleared: () => state.clearSession(),
  };
});
