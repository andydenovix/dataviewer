"use client";

import React, { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { Bell } from 'lucide-react';
import { listenToNotifications } from './labService';
import { BRAND_COLOR } from '../lib/constants';

export const Navbar = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      const unsub = listenToNotifications(user.uid, setNotifications);
      return () => unsub();
    }
  }, [user]);

  const loginWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  return (
    <nav 
      className="flex justify-between items-center px-8 py-4 border-b border-white/10 no-print sticky top-0 z-50 shadow-sm"
      style={{ backgroundColor: BRAND_COLOR }}
    >
      <div className="flex items-center gap-3">
        <img 
          src="/logo.png" 
          alt="DeNovix Logo" 
          className="h-7 w-auto"
        />
        <div className="font-bold text-white text-xl tracking-tight">Data Vault</div>
      </div>
      <div className="flex items-center gap-8">
        <a 
          href="https://www.denovix.com/special-offers/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs font-bold text-white/90 hover:text-white transition-colors uppercase tracking-widest"
        >
          Your Special Offers
        </a>
        <div>
        {user ? (
          <div className="flex items-center gap-4">
            <div className="relative">
              <Bell className="h-5 w-5 text-white/80 cursor-pointer hover:text-white transition-colors" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold h-4 w-4 flex items-center justify-center rounded-full">
                  {notifications.length}
                </span>
              )}
            </div>
            <span className="text-sm text-white/90 font-medium">{user.email}</span>
            <button 
              onClick={() => signOut(auth)}
              className="px-4 py-2 text-sm font-bold text-white hover:bg-white/10 rounded-lg transition-colors uppercase tracking-wider"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button 
            onClick={loginWithGoogle}
            className="px-6 py-2 bg-white rounded-full text-sm font-bold hover:bg-slate-50 transition-all shadow-lg shadow-white/5"
            style={{ color: BRAND_COLOR }}
          >
            Sign In with Google
          </button>
        )}
      </div>
      </div>
    </nav>
  );
};