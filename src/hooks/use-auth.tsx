"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { User } from "@/lib/types";
import { seedDatabase } from "@/lib/storage";

interface AuthContextType {
  user: User | null;
  adoptUser: (user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  adoptUser: () => {},
  logout: () => {},
  loading: true,
});

const SESSION_KEY = "fleetcheck-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await seedDatabase();
      localStorage.removeItem(SESSION_KEY);
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { user?: User | null };
          if (data.user && !cancelled) {
            setUser(data.user);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Stay signed out when the session check cannot run.
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const adoptUser = useCallback((next: User) => {
    setUser(next);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, adoptUser, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
