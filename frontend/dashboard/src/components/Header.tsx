'use client';

import React from 'react';
import { Menu, Bell, Moon, Sun, User, LogOut, Shield, HelpCircle, ChevronDown } from 'lucide-react';
import { useTheme } from 'next-themes';

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden lg:flex items-center gap-6">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">CloudDecept Dashboard</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 relative" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-danger-500 rounded-full" />
          </button>

          <div className="hidden lg:flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary-600" />
              <span className="text-sm text-slate-600 dark:text-slate-300">admin@clouddecept</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
              <span className="text-sm font-medium text-primary-700 dark:text-primary-300">A</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}