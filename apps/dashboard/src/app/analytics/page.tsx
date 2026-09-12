'use client';

import { useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import {
  AlertTriangle,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Globe2,
  ShieldAlert,
  Activity,
  Zap,
  Terminal,
  Cpu,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useDashboardStore } from '@/lib/store';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';

const NEON_PALETTE = [
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#f43f5e', // rose
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#ec4899', // pink
];

const THREAT_COLORS: Record<string, string> = {
  Critical: '#f43f5e',
  High: '#f97316',
  Medium: '#f59e0b',
  Low: '#10b981',
  Unclassified: '#64748b',
};

const CustomTooltip = ({ active, payload, label, unit = 'events' }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#050a18]/95 border border-cyan-500/40 rounded-lg p-2.5 shadow-neon text-xs font-mono backdrop-blur-md">
        <p className="text-cyan-300 font-bold mb-1">{label || payload[0].name}</p>
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: payload[0].color || payload[0].fill || '#06b6d4' }}
          />
          <span className="text-slate-300">
            {Number(payload[0].value).toLocaleString()} {unit}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export default function AnalyticsPage() {
  const {
    stats,
    totalSessions,
    activeSessions,
    totalCommands,
    uniqueAttackers,
    topCountries: statsTopCountries,
    topIntents: statsTopIntents,
    threatDistribution: statsThreatDist,
    sessionsPerDay: statsSessionsPerDay,
    isLoading,
    isError,
    refresh,
  } = useDashboardStats();

  const { connectionStatus, fetchConnectionStatus } = useDashboardStore();

  useEffect(() => {
    fetchConnectionStatus();
  }, [fetchConnectionStatus]);

  const isApiHealthy = connectionStatus?.connected ?? false;

  // 1. Hourly session trend (Last 24 Hours)
  const hourlyData = useMemo(() => {
    if (stats?.sessions_per_hour && stats.sessions_per_hour.length > 0) {
      return stats.sessions_per_hour.map((item) => ({
        hour: item.hour,
        sessions: item.count,
      }));
    }
    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      sessions: 0,
    }));
  }, [stats?.sessions_per_hour]);

  // 2. Commands by day (Last 7 Days)
  const commandsDailyData = useMemo(() => {
    if (stats?.commands_per_day && stats.commands_per_day.length > 0) {
      return stats.commands_per_day.map((item) => {
        let label = item.date;
        try {
          label = format(new Date(item.date + 'T00:00:00Z'), 'MMM d');
        } catch {
          // keep original
        }
        return {
          date: label,
          commands: item.count,
          rawDate: item.date,
        };
      });
    }
    return [];
  }, [stats?.commands_per_day]);

  // 3. Sessions over time (Last 7 Days)
  const sessionsDailyData = useMemo(() => {
    if (statsSessionsPerDay && statsSessionsPerDay.length > 0) {
      return statsSessionsPerDay.map((item: any) => {
        let label = item.date;
        try {
          label = format(new Date(item.date + 'T00:00:00Z'), 'MMM d');
        } catch {
          // keep original
        }
        return {
          date: label,
          sessions: item.count,
          rawDate: item.date,
        };
      });
    }
    return [];
  }, [statsSessionsPerDay]);

  // 4. Intent distribution (All-Time Authoritative)
  const intentData = useMemo(() => {
    if (statsTopIntents && statsTopIntents.length > 0) {
      return statsTopIntents.map((item, index) => ({
        name: normalizeIntent(item.intent).label,
        value: item.count,
        color: NEON_PALETTE[index % NEON_PALETTE.length],
      }));
    }
    return [];
  }, [statsTopIntents]);

  // 5. Country distribution (All-Time Authoritative)
  const countryData = useMemo(() => {
    if (statsTopCountries && statsTopCountries.length > 0) {
      return statsTopCountries.slice(0, 10).map((item, index) => ({
        name: getCountryName(item.country),
        rawCode: item.country,
        value: item.count,
        color: NEON_PALETTE[index % NEON_PALETTE.length],
      }));
    }
    return [];
  }, [statsTopCountries]);

  // 6. Threat level distribution (All-Time Authoritative)
  const threatData = useMemo(() => {
    const order = ['Critical', 'High', 'Medium', 'Low', 'Unclassified'];
    const entries: { level: string; count: number; color: string }[] = [];

    for (const lvl of order) {
      const cnt = statsThreatDist[lvl.toLowerCase()] || 0;
      if (cnt > 0) {
        entries.push({
          level: lvl,
          count: cnt,
          color: THREAT_COLORS[lvl] || '#64748b',
        });
      }
    }
    return entries;
  }, [statsThreatDist]);

  const totalThreatEvaluated = useMemo(() => {
    return threatData.reduce((acc, d) => acc + d.count, 0);
  }, [threatData]);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto text-slate-100">
      {/* Header HUD */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">
              Aggregated Telemetry
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="text-xs font-mono text-cyan-300">ClickHouse Engine Online</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-cyan-400" />
            ANALYTICS & THREAT POSTURE INTELLIGENCE
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl font-mono">
            Authoritative ClickHouse aggregations across sessions, commands, geolocation, and threat postures
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => refresh()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-cyan-500/30 bg-[#050a18]/90 text-cyan-300 hover:text-cyan-200 hover:border-cyan-400 text-xs font-mono font-bold transition-all disabled:opacity-50 shadow-neon"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            REFRESH ANALYTICS
          </button>
        </div>
      </div>

      {/* Backend API Connection Banner */}
      {(!isApiHealthy || isError) && (
        <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-lg flex items-center gap-3 text-amber-300 font-mono text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="font-bold">BACKEND TELEMETRY DISCONNECTED</p>
            <p className="text-slate-400 text-[11px]">
              Historical analytical metrics require an active ClickHouse backend connection.
            </p>
          </div>
        </div>
      )}

      {/* Top HUD KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-cyan-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
              TOTAL SESSIONS (ALL-TIME) (ALL-TIME)
            </span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-3xl font-mono font-bold text-white mt-2">
            {totalSessions.toLocaleString()}
          </p>
          <div className="mt-2 pt-2 border-t border-cyan-500/10 flex items-center justify-between text-[11px] font-mono text-cyan-300">
            <span>Primary Ingestion Store</span>
            <span className="text-emerald-400 font-bold">100% Verified</span>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-emerald-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
              ACTIVE SESSIONS
            </span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-mono font-bold text-emerald-400 mt-2">
            {activeSessions.toLocaleString()}
          </p>
          <div className="mt-2 pt-2 border-t border-emerald-500/10 flex items-center justify-between text-[11px] font-mono text-emerald-300">
            <span>Live Socket Connections</span>
            <span className="text-emerald-400 font-bold animate-pulse">MONITORED</span>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-purple-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
              TOTAL COMMANDS (ALL-TIME)
            </span>
            <Terminal className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-3xl font-mono font-bold text-purple-300 mt-2">
            {totalCommands.toLocaleString()}
          </p>
          <div className="mt-2 pt-2 border-t border-purple-500/10 flex items-center justify-between text-[11px] font-mono text-purple-300">
            <span>Payloads & Invocations</span>
            <span className="text-purple-400 font-bold">LOGGED</span>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-rose-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
              UNIQUE ADVERSARIES
            </span>
            <Users className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-3xl font-mono font-bold text-rose-300 mt-2">
            {uniqueAttackers.toLocaleString()}
          </p>
          <div className="mt-2 pt-2 border-t border-rose-500/10 flex items-center justify-between text-[11px] font-mono text-rose-300">
            <span>Distinct Attacker IPs</span>
            <span className="text-rose-400 font-bold">PROFILED</span>
          </div>
        </div>
      </div>

      {/* Grid: Sessions by Hour & Commands by Day */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions by Hour */}
        <div className="glass-panel rounded-xl border border-cyan-500/20 overflow-hidden">
          <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-[#050a18]/60">
            <div>
              <h2 className="text-sm font-mono font-bold text-white tracking-wider flex items-center gap-2 uppercase">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                TEMPORAL SESSIONS BY HOUR (LAST 24 HOURS)
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Dynamic ingress distribution over the trailing 24-hour window
              </p>
            </div>
          </div>
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="colorSessionsDark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="hour" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} fontStretch="condensed" />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip unit="sessions" />} />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSessionsDark)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Commands by Day */}
        <div className="glass-panel rounded-xl border border-cyan-500/20 overflow-hidden">
          <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-[#050a18]/60">
            <div>
              <h2 className="text-sm font-mono font-bold text-white tracking-wider flex items-center gap-2 uppercase">
                <Terminal className="w-4 h-4 text-blue-400" />
                COMMAND EXECUTIONS BY DAY (LAST 7 DAYS)
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Volume of attacker terminal executions recorded over the trailing 7 days
              </p>
            </div>
          </div>
          <div className="p-4 h-72">
            {commandsDailyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                No daily command activity recorded in window
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commandsDailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip unit="commands" />} />
                  <Bar dataKey="commands" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Top Attack Intents & Top Attacker Geographies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Attack Intents */}
        <div className="glass-panel rounded-xl border border-cyan-500/20 overflow-hidden">
          <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-[#050a18]/60">
            <div>
              <h2 className="text-sm font-mono font-bold text-white tracking-wider flex items-center gap-2 uppercase">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                MITRE ATT&CK INTENT OBJECTIVE TAXONOMY
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Categorized behavioral intent breakdown (All-Time Authoritative)
              </p>
            </div>
          </div>
          <div className="p-4 h-80">
            {intentData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                No intent classification data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={intentData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) =>
                      percent >= 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                    }
                    stroke="#030712"
                    strokeWidth={2}
                  >
                    {intentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip unit="intents" />} />
                  <Legend
                    verticalAlign="bottom"
                    height={40}
                    iconType="circle"
                    formatter={(val) => <span className="text-xs font-mono text-slate-300">{val}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Attacker Geographies */}
        <div className="glass-panel rounded-xl border border-cyan-500/20 overflow-hidden">
          <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-[#050a18]/60">
            <div>
              <h2 className="text-sm font-mono font-bold text-white tracking-wider flex items-center gap-2 uppercase">
                <Globe2 className="w-4 h-4 text-purple-400" />
                PRIMARY ORIGIN GEOGRAPHIES (ALL-TIME)
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Top source countries mapped by verified session volume
              </p>
            </div>
          </div>
          <div className="p-4 h-80">
            {countryData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                No geographic data recorded
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={countryData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={110}
                  />
                  <Tooltip content={<CustomTooltip unit="sessions" />} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Grid: Threat Level Distribution & Sessions Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Threat Level Distribution */}
        <div className="glass-panel rounded-xl border border-cyan-500/20 overflow-hidden">
          <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-[#050a18]/60">
            <div>
              <h2 className="text-sm font-mono font-bold text-white tracking-wider flex items-center gap-2 uppercase">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                THREAT LEVEL SPECTRUM (ALL-TIME)
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Risk tier classifications</p>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-300">
              {totalThreatEvaluated.toLocaleString()} EVALUATED
            </span>
          </div>
          <div className="p-4 h-72">
            {threatData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                No threat assessment records
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={threatData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="level"
                    label={({ level, percent }) =>
                      percent >= 0.05 ? `${level} ${(percent * 100).toFixed(0)}%` : ''
                    }
                    stroke="#030712"
                    strokeWidth={2}
                  >
                    {threatData.map((entry, index) => (
                      <Cell key={`threat-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip unit="sessions" />} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(val) => <span className="text-xs font-mono text-slate-300">{val}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sessions Over Time (Last 7 Days) */}
        <div className="glass-panel lg:col-span-2 rounded-xl border border-cyan-500/20 overflow-hidden">
          <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-[#050a18]/60">
            <div>
              <h2 className="text-sm font-mono font-bold text-white tracking-wider flex items-center gap-2 uppercase">
                <Activity className="w-4 h-4 text-amber-400" />
                DAILY SESSION TIMELINE (LAST 7 DAYS)
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Daily unique honeypot intrusion trajectories recorded
              </p>
            </div>
          </div>
          <div className="p-4 h-72">
            {sessionsDailyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                No daily session records in current window
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sessionsDailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip unit="sessions" />} />
                  <Line
                    type="monotone"
                    dataKey="sessions"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, strokeWidth: 2, fill: '#f59e0b' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
