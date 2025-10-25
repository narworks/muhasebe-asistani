
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// Gerçek Firebase entegrasyonu için bu yorumları kaldırın
// import { 
//   getAuth, 
//   onAuthStateChanged, 
//   GoogleAuthProvider, 
//   signInWithPopup, 
//   createUserWithEmailAndPassword, 
//   signInWithEmailAndPassword, 
//   signOut,
//   User 
// } from 'firebase/auth';
// import { firebaseApp } from '../firebaseConfig'; // Firebase config dosyanız

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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // const auth = getAuth(firebaseApp);

  useEffect(() => {
    // Gerçek Firebase onAuthStateChanged listener
    // const unsubscribe = onAuthStateChanged(auth, user => {
    //   setCurrentUser(user);
    //   setLoading(false);
    // });
    // return unsubscribe;

    // Placeholder: 1 saniye sonra sahte bir kullanıcı ile giriş yapılmış gibi davran
    setTimeout(() => {
        // Test için başlangıçta kullanıcı olmasın.
        // setCurrentUser({ uid: '123', email: 'test@example.com', displayName: 'Test User' });
        setLoading(false);
    }, 1000);
  }, []);

  const loginWithGoogle = async () => {
    // const provider = new GoogleAuthProvider();
    // await signInWithPopup(auth, provider);
    console.log('Logging in with Google...');
    setCurrentUser({ uid: 'google-user-123', email: 'google@example.com', displayName: 'Google User' });
  };

  const loginWithEmail = async (email: string, password: string) => {
    // await signInWithEmailAndPassword(auth, email, password);
    console.log('Logging in with email...');
    setCurrentUser({ uid: 'email-user-456', email: email, displayName: 'Email User' });
  };

  const registerWithEmail = async (email: string, password: string, displayName: string) => {
    // await createUserWithEmailAndPassword(auth, email, password);
    console.log('Registering with email...');
    setCurrentUser({ uid: 'email-user-789', email: email, displayName: displayName });
  };

  const logout = async () => {
    // await signOut(auth);
    console.log('Logging out...');
    setCurrentUser(null);
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