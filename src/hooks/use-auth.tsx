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
import { getUserById, seedDatabase } from "@/lib/storage";

interface AuthContextType {
  user: User | null;
  login: (userId: string) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  loading: true,
});

const SESSION_KEY = "fleetcheck-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      await seedDatabase();
      const sessionId = localStorage.getItem(SESSION_KEY);
      if (sessionId) {
        const u = await getUserById(sessionId);
        if (u) setUser(u);
      }
      setLoading(false);
    }
    init();
  }, []);

  const login = useCallback(async (userId: string) => {
    const u = await getUserById(userId);
    if (u) {
      setUser(u);
      localStorage.setItem(SESSION_KEY, userId);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
