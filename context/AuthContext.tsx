
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

// Key for our mock user database in localStorage
const MOCK_USER_DB_KEY = 'mockUserDatabase';


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
    console.log('Logging in with email...');
    // Retrieve our mock database from localStorage
    const db = JSON.parse(localStorage.getItem(MOCK_USER_DB_KEY) || '{}');
    const userData = db[email];

    if (userData) {
      // User found, log them in with the saved displayName
      setCurrentUser({ 
        uid: `email-user-${Math.random().toString(36).substring(7)}`, 
        email: email, 
        displayName: userData.displayName 
      });
    } else {
      // User not found in our mock db, simulate an error
      throw new Error("Kullanıcı bulunamadı veya şifre yanlış.");
    }
  };

  const registerWithEmail = async (email: string, password: string, displayName: string) => {
    console.log('Registering with email...');
    // Retrieve our mock database
    const db = JSON.parse(localStorage.getItem(MOCK_USER_DB_KEY) || '{}');
    
    // Add new user to the mock database
    db[email] = { displayName };
    localStorage.setItem(MOCK_USER_DB_KEY, JSON.stringify(db));
    
    // Set the current user upon successful registration
    setCurrentUser({ 
      uid: `email-user-${Math.random().toString(36).substring(7)}`, 
      email: email, 
      displayName: displayName 
    });
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