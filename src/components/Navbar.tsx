"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { Bell, X, Share2, CheckCheck } from 'lucide-react';
import { listenToNotifications, markNotificationRead, markAllNotificationsRead } from './labService';
import { convertFirestoreTimestampToDate } from '@/lib/utils';
import { BRAND_COLOR } from '../lib/constants';

interface AppNotification {
  id: string;
  type: string;
  message: string;
  createdAt: any;
  isRead: boolean;
}

function relativeTime(date: Date | null): string {
  if (!date) return '';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const Navbar = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      const unsub = listenToNotifications(user.uid, setNotifications);
      return () => unsub();
    }
  }, [user]);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleMarkRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    await markAllNotificationsRead(notifications.map(n => n.id));
    setIsOpen(false);
  }, [notifications]);

  const loginWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  return (
    <nav
      className="flex justify-between items-center px-8 py-4 border-b border-white/10 no-print sticky top-0 z-50 shadow-sm"
      style={{ backgroundColor: BRAND_COLOR }}
    >
      <a href="/" className="flex items-center gap-3 hover:opacity-85 transition-opacity">
        <img src="/logo.png" alt="DeNovix Logo" className="h-7 w-auto" />
        <div className="font-bold text-white text-xl tracking-tight">Data Vault</div>
      </a>

      <div className="flex items-center gap-8">
        <a
          href="https://www.denovix.com/special-offers/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-white/90 hover:text-white transition-colors uppercase tracking-widest"
        >
          Your Special Offers
        </a>

        {user ? (
          <div className="flex items-center gap-4">
            {/* Notification bell + popover */}
            <div className="relative" ref={popoverRef}>
              <button
                onClick={() => setIsOpen(prev => !prev)}
                className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5 text-white/80 hover:text-white transition-colors" />
                {notifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-black h-4 w-4 flex items-center justify-center rounded-full leading-none">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-[60]">
                  {/* Popover header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span className="font-bold text-slate-800 text-sm">Notifications</span>
                    <div className="flex items-center gap-1">
                      {notifications.length > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors px-2 py-1 rounded-md hover:bg-blue-50"
                          title="Mark all as read"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          All read
                        </button>
                      )}
                      <button
                        onClick={() => setIsOpen(false)}
                        className="p-1 text-slate-300 hover:text-slate-500 rounded-md transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Notification list */}
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center">
                        <Bell className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No new notifications</p>
                      </div>
                    ) : (
                      notifications.map(notif => {
                        const date = convertFirestoreTimestampToDate(notif.createdAt);
                        return (
                          <div
                            key={notif.id}
                            className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors group"
                          >
                            <div className="mt-0.5 p-1.5 bg-purple-100 rounded-lg shrink-0">
                              <Share2 className="h-3.5 w-3.5 text-purple-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 leading-snug">{notif.message}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{relativeTime(date)}</p>
                            </div>
                            <button
                              onClick={() => handleMarkRead(notif.id)}
                              className="opacity-0 group-hover:opacity-100 shrink-0 p-1 text-slate-300 hover:text-blue-500 rounded transition-all"
                              title="Dismiss"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
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
    </nav>
  );
};
