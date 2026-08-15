'use client';

import { cn } from '@/lib/utils';
import { Bell, Search, RefreshCw, Wifi, WifiOff, Menu, Server, Database, Wifi as WifiIcon } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';

export function Header() {
  const { connectionStatus, fetchConnectionStatus } = useDashboardStore();

  const isApiHealthy = connectionStatus?.connected ?? false;
  const apiStatus = connectionStatus?.status ?? 'unknown';
  const clickhouseStatus = connectionStatus?.clickhouse ?? 'unknown';
  const postgresStatus = connectionStatus?.postgres ?? 'unknown';
  const redisStatus = connectionStatus?.redis ?? 'unknown';

  return (
    <header className={cn('fixed top-0 right-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center px-4 transition-all duration-300 w-full')}>
      <div className="flex-1 flex items-center justify-between gap-4 max-w-full">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search sessions, commands, IPs..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              aria-label="Search"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={fetchConnectionStatus}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Refresh connection status"
            title="Refresh connection status"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {/* Unified connection status with dropdown */}
          <div className="relative">
            <button
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50',
                'hover:bg-gray-100 transition-colors'
              )}
              onClick={() => {
                // Could add dropdown logic here
              }}
              aria-label="Connection status"
              aria-expanded="false"
            >
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  isApiHealthy ? 'bg-green-500' : 'bg-red-500'
                )}
              />
              <span className="text-xs font-medium text-gray-700">
                {isApiHealthy ? 'Connected' : 'Disconnected'}
              </span>
            </button>

            {/* Tooltip/popover with detailed status */}
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 hidden group-hover:block">
              <div className="text-xs font-medium text-gray-900 mb-2">Service Status</div>
              <div className="space-y-1.5">
                <div className={cn('flex items-center justify-between text-xs', isApiHealthy ? 'text-green-600' : 'text-red-600')}>
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3 h-3" />
                    API Gateway
                  </span>
                  <span className="font-medium capitalize">{apiStatus}</span>
                </div>
                <div className={cn('flex items-center justify-between text-xs', clickhouseStatus === 'healthy' ? 'text-green-600' : 'text-red-600')}>
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3 h-3" />
                    ClickHouse
                  </span>
                  <span className="font-medium capitalize">{clickhouseStatus}</span>
                </div>
                <div className={cn('flex items-center justify-between text-xs', postgresStatus === 'healthy' ? 'text-green-600' : 'text-red-600')}>
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3 h-3" />
                    PostgreSQL
                  </span>
                  <span className="font-medium capitalize">{postgresStatus}</span>
                </div>
                <div className={cn('flex items-center justify-between text-xs', redisStatus === 'healthy' ? 'text-green-600' : 'text-red-600')}>
                  <span className="flex items-center gap-1.5">
                    <WifiIcon className="w-3 h-3" />
                    Redis
                  </span>
                  <span className="font-medium capitalize">{redisStatus}</span>
                </div>
              </div>
              {connectionStatus?.lastChecked && (
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                  Last checked: {new Date(connectionStatus.lastChecked).toLocaleTimeString()}
                </div>
              )}
            </div>
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