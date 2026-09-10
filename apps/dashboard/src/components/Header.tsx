'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Search,
  RefreshCw,
  Radio,
  Clock,
  Shield,
  Menu,
} from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { useSidebar } from '@/lib/SidebarContext';
import { useRouter } from 'next/navigation';

export function Header() {
  const router = useRouter();
  const { connectionStatus, fetchConnectionStatus, fetchStats } = useDashboardStore();
  const { collapsed, setCollapsed } = useSidebar();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toUTCString().replace('GMT', 'UTC'));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchConnectionStatus(),
        fetchStats(24),
      ]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const isApiHealthy = connectionStatus?.connected ?? false;

  return (
    <header className="fixed top-0 right-0 z-30 h-16 bg-[#040816]/90 backdrop-blur-2xl border-b border-cyan-500/15 flex items-center px-4 sm:px-6 w-full lg:w-[calc(100%-16rem)] transition-all duration-300">
      <div className="flex-1 flex items-center justify-between gap-4 max-w-full">
        {/* Left: Mobile hamburger & Global Search */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-900 border border-slate-800"
            aria-label="Toggle navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="relative min-w-0 flex-1 max-w-md hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
            <input
              type="search"
              placeholder="Search threat events, IPs, MITRE techniques..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  router.push(`/sessions`);
                }
              }}
              className="w-full pl-9 pr-12 py-1.5 text-xs font-mono rounded-lg bg-[#070e22] border border-cyan-500/20 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all"
              aria-label="Global SOC search"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] font-mono text-slate-400 bg-slate-800/80 rounded border border-slate-700/60 pointer-events-none">
              /
            </kbd>
          </div>
        </div>

        {/* Right: SOC Operational HUD */}
        <div className="flex items-center gap-3.5 flex-shrink-0">
          {/* Live UTC Clock */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-[#070e22] border border-cyan-500/15 text-[11px] font-mono text-cyan-300/90">
            <Clock className="w-3.5 h-3.5 text-cyan-400/70" />
            <span>{currentTime || 'SYNCHRONIZING UTC...'}</span>
          </div>

          {/* System Status Pill */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#070e22] border border-cyan-500/20">
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                isApiHealthy ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse' : 'bg-rose-500'
              )}
            />
            <span className="text-[11px] font-mono font-bold tracking-wider text-slate-200 uppercase">
              {isApiHealthy ? 'SYSTEM OPERATIONAL' : 'SYSTEM DISCONNECTED'}
            </span>
          </div>

          {/* Telemetry Refresh Action */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-[#070e22] border border-cyan-500/20 text-slate-300 hover:text-cyan-300 hover:border-cyan-400/40 transition-all disabled:opacity-50"
            title="Refresh backend telemetry"
            aria-label="Refresh telemetry status"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin text-cyan-400')} />
          </button>
        </div>
      </div>
    </header>
  );
}