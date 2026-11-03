import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, tokenStore } from "./api";
import type { User } from "./types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (username: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);
export const IDLE_MINUTES = 15;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const qc = useQueryClient();

  useEffect(() => {
    if (tokenStore.get()) {
      api<User>("/api/auth/me")
        .then(setUser)
        .catch(() => tokenStore.clear())
        .finally(() => setLoading(false));
    }
    const onLogout = () => setUser(null);
    window.addEventListener("cw-logout", onLogout);
    return () => window.removeEventListener("cw-logout", onLogout);
  }, []);

  const login = async (username: string) => {
    const res = await api<{ access_token: string; user: Omit<User, "permissions">; permissions: string[] }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ username }) },
    );
    tokenStore.set(res.access_token);
    setUser({ ...res.user, permissions: res.permissions });
  };

  const logout = () => {
    tokenStore.clear();
    qc.clear();
    setUser(null);
  };

  // Idle session timeout (HIPAA access-control safeguard): sign out after IDLE_MINUTES without interaction.
  useEffect(() => {
    if (!user) return;
    let last = Date.now();
    const touch = () => (last = Date.now());
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - last > IDLE_MINUTES * 60_000) {
        sessionStorage.setItem("cw_idle_logout", "1");
        logout();
      }
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const can = (p: string) => !!user?.permissions.includes(p);

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
