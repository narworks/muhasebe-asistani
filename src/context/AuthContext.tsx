import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Placeholder User type
type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

const CURRENT_USER_KEY = 'currentUser';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(CURRENT_USER_KEY);
      if (savedUser) {
        setCurrentUser(JSON.parse(savedUser));
        // Optional: Re-verify token with electronAPI on load?
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem(CURRENT_USER_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  const setUserAndPersist = (user: User | null) => {
    setCurrentUser(user);
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  };

  const loginWithGoogle = async () => {
    // Disabled in Electron for now or redirect
    alert("Google ile giriş bu sürümde desteklenmemektedir. Lütfen e-posta ile giriş yapın.");
  };

  const loginWithEmail = async (email: string, password: string) => {
    console.log('Logging in with email via Electron IPC...');

    if (!window.electronAPI) {
      console.error("Electron API unavailable");
      throw new Error("Masaüstü uygulaması bağlamı bulunamadı.");
    }

    const result = await window.electronAPI.checkSubscription({ email, password });

    if (result.success) {
      const user = {
        uid: email,
        email: email,
        displayName: email.split('@')[0]
      };
      setUserAndPersist(user);
    } else {
      throw new Error(result.message || "Giriş başarısız.");
    }
  };

  const registerWithEmail = async (email: string, password: string, displayName: string) => {
    throw new Error("Kayıt işlemi web sitesi üzerinden yapılmalıdır.");
  };

  const logout = async () => {
    console.log('Logging out...');
    setUserAndPersist(null);
  };

  const value = {
    currentUser,
    loading,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
