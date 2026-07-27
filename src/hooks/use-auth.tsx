"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { User, UserRole } from "@/lib/types";
import { getUserById, getUsers, seedDatabase } from "@/lib/storage";

interface AuthContextType {
  user: User | null;
  login: (userId: string) => void;
  loginAsRole: (role: UserRole) => Promise<boolean>;
  loginByEmail: (email: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  loginAsRole: async () => false,
  loginByEmail: async () => false,
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

  const loginAsRole = useCallback(async (role: UserRole) => {
    await seedDatabase();
    const users = await getUsers();
    const match = users.find((u) => u.role === role);
    if (!match) return false;
    setUser(match);
    localStorage.setItem(SESSION_KEY, match.id);
    return true;
  }, []);

  const loginByEmail = useCallback(async (email: string) => {
    await seedDatabase();
    const users = await getUsers();
    const match = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (!match) return false;
    setUser(match);
    localStorage.setItem(SESSION_KEY, match.id);
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, login, loginAsRole, loginByEmail, logout, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
