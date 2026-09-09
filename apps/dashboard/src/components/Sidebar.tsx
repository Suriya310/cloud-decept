'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Activity,
  Shield,
  Database,
  Settings,
  BarChart3,
  Terminal,
  ChevronLeft,
  ChevronRight,
  Radio,
  Zap,
} from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { useSidebar } from '@/lib/SidebarContext';

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard, badge: 'SOC' },
  { name: 'Live Sessions', href: '/sessions', icon: Activity },
  { name: 'Threat Intelligence', href: '/threat-intel', icon: Shield },
  { name: 'Commands', href: '/commands', icon: Terminal },
  { name: 'Adaptations', href: '/adaptations', icon: Zap },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useSidebar();
  const { connectionStatus } = useDashboardStore();

  const isApiHealthy = connectionStatus?.connected ?? false;
  const clickhouseStatus = connectionStatus?.clickhouse ?? 'unknown';
  const postgresStatus = connectionStatus?.postgres ?? 'unknown';
  const redisStatus = connectionStatus?.redis ?? 'unknown';

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-full transition-all duration-300 flex flex-col',
        'bg-[#040816]/95 backdrop-blur-2xl border-r border-cyan-500/15 shadow-2xl shadow-cyan-950/20',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-cyan-500/15">
        {!collapsed ? (
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-400 p-0.5 shadow-lg shadow-cyan-500/30 group-hover:shadow-cyan-400/50 transition-all">
              <div className="w-full h-full bg-[#040816] rounded-[7px] flex items-center justify-center">
                <Shield className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-wider text-white uppercase block leading-tight font-mono">
                CloudDecept
              </span>
              <span className="text-[10px] text-cyan-400/70 font-mono tracking-widest uppercase block">
                SOC COMMAND
              </span>
            </div>
          </Link>
        ) : (
          <div className="mx-auto">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-400 p-0.5">
              <div className="w-full h-full bg-[#040816] rounded-[7px] flex items-center justify-center">
                <Shield className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 transition-colors border border-transparent hover:border-cyan-500/20',
            collapsed && 'hidden'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-2.5 py-4 space-y-1.5 overflow-y-auto scrollbar-thin">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 select-none',
                isActive
                  ? 'text-cyan-300 bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent border-l-2 border-cyan-400 shadow-sm shadow-cyan-950/50'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon
                className={cn(
                  'w-4 h-4 flex-shrink-0 transition-colors',
                  isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-300'
                )}
              />

              {!collapsed && (
                <span className="flex-1 truncate tracking-wide">{item.name}</span>
              )}

              {!collapsed && item.badge && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 text-[9px] font-mono font-bold rounded',
                    isActive
                      ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700/50'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Datastore Connectivity HUD */}
      {!collapsed && (
        <div className="p-3 mx-2.5 mb-2.5 rounded-lg bg-[#070e22] border border-cyan-500/15 text-[11px] space-y-2">
          <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
              TELEMETRY BUS
            </span>
            <span className={cn('font-bold', isApiHealthy ? 'text-emerald-400' : 'text-rose-400')}>
              {isApiHealthy ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-800/80 font-mono text-[9px]">
            <div className="text-center p-1 rounded bg-[#030712]/60">
              <span className="block text-slate-500">CH</span>
              <span className={cn('font-bold', clickhouseStatus === 'healthy' ? 'text-emerald-400' : 'text-slate-400')}>
                {clickhouseStatus === 'healthy' ? 'OK' : 'ERR'}
              </span>
            </div>
            <div className="text-center p-1 rounded bg-[#030712]/60">
              <span className="block text-slate-500">REDIS</span>
              <span className={cn('font-bold', redisStatus === 'healthy' ? 'text-emerald-400' : 'text-slate-400')}>
                {redisStatus === 'healthy' ? 'OK' : 'ERR'}
              </span>
            </div>
            <div className="text-center p-1 rounded bg-[#030712]/60">
              <span className="block text-slate-500">PG</span>
              <span className={cn('font-bold', postgresStatus === 'healthy' ? 'text-emerald-400' : 'text-slate-400')}>
                {postgresStatus === 'healthy' ? 'OK' : 'ERR'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer Toggle */}
      {collapsed && (
        <div className="p-2 border-t border-cyan-500/15 flex justify-center">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </aside>
  );
}