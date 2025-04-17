'use client';

import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo } from 'react';
import { Session, User, AuthError, AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

// Create the Supabase client instance outside the component
const supabase = createClient();

type AuthContextType = {
    supabase: SupabaseClient;
    session: Session | null;
    user: User | null;
    isLoading: boolean;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    // Fetch initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Error fetching initial session:", error);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setIsLoading(false);
    }).catch((error: AuthError | Error) => { // Catch any other potential errors during the promise chain
        console.error("Error fetching initial session:", error);
        setIsLoading(false);
    });


    // Listen for changes to authentication state
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        console.log("Auth state changed:", _event, session);
        setSession(session);
        setUser(session?.user ?? null);
        // Note: Don't set loading false here, initial load handles that
      }
    );

    // Cleanup listener on unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // State will update via onAuthStateChange listener
  };

  const value = {
    supabase,
    session,
    user,
    isLoading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the AuthContext
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
