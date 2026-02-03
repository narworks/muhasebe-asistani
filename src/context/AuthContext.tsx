import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
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
    const loadUser = async () => {
      try {
        // localStorage'dan kullanıcı bilgisini yükle
        const savedUser = localStorage.getItem(CURRENT_USER_KEY);
        if (savedUser) {
          const user = JSON.parse(savedUser);

          // Electron API ile token geçerliliğini kontrol et
          if (window.electronAPI) {
            const userInfo = await window.electronAPI.getUserInfo();

            if (userInfo.userId && userInfo.email) {
              // Token geçerli, kullanıcıyı set et
              setCurrentUser(user);
            } else {
              // Token geçersiz, kullanıcıyı temizle
              localStorage.removeItem(CURRENT_USER_KEY);
              setCurrentUser(null);
            }
          } else {
            // Electron API yoksa (geliştirme modunda olabilir), kullanıcıyı yükle
            setCurrentUser(user);
          }
        }
      } catch (error) {
        console.error("Failed to load user:", error);
        localStorage.removeItem(CURRENT_USER_KEY);
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const setUserAndPersist = (user: User | null) => {
    setCurrentUser(user);
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    if (!window.electronAPI) {
      throw new Error("Masaüstü uygulaması bağlamı bulunamadı.");
    }

    // Supabase login via Electron IPC
    const result = await window.electronAPI.login({ email, password });

    if (result.success) {
      const user: User = {
        uid: email, // Supabase userId yerine email kullanıyoruz (frontend'de önemli değil)
        email: email,
        displayName: email.split('@')[0]
      };
      setUserAndPersist(user);
    } else {
      throw new Error(result.message || "Giriş başarısız.");
    }
  };

  const logout = async () => {
    if (window.electronAPI) {
      try {
        await window.electronAPI.logout();
      } catch (error) {
        console.warn('Logout IPC failed:', error);
      }
    }

    setUserAndPersist(null);
  };

  const value = {
    currentUser,
    loading,
    loginWithEmail,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
