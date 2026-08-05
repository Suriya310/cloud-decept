'use client';

import { cn } from '@/lib/utils';
import { Bell, Search, RefreshCw, Wifi, WifiOff, Menu } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';

export function Header() {
  const { isConnected, fetchStats } = useDashboardStore();

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center px-4 transition-all duration-300',
        'lg:ml-64'
      )}
    >
      <div className="flex-1 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search sessions, commands, IPs..."
              className="w-72 pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              aria-label="Search"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStats}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Refresh data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-green-500' : 'bg-red-500'
              )}
            />
            <span className="text-xs text-gray-600">
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>

          <button className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors relative" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>
        </div>
      </div>
    </header>
  );
}