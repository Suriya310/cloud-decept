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
import { AlertTriangle, RefreshCw, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useDashboardStore } from '@/lib/store';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';

const COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#6366f1', // indigo
];

const THREAT_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
  Unclassified: '#94a3b8',
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
      return statsSessionsPerDay.map((item) => {
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
        color: COLORS[index % COLORS.length],
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
        color: COLORS[index % COLORS.length],
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
          color: THREAT_COLORS[lvl] || '#94a3b8',
        });
      }
    }
    return entries;
  }, [statsThreatDist]);

  const totalThreatEvaluated = useMemo(() => {
    return threatData.reduce((acc, d) => acc + d.count, 0);
  }, [threatData]);

  return (
    <main className="p-6 space-y-6">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics & Historical Trends</h1>
          <p className="text-gray-500 mt-1">
            Authoritative ClickHouse aggregations across sessions, commands, geolocation, and threat postures
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refresh()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Refresh Analytics
          </button>
        </div>
      </div>

      {/* Backend API Connection Banner */}
      {(!isApiHealthy || isError) && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Backend API unreachable</p>
            <p className="text-sm text-amber-700">
              Historical analytical metrics require an active ClickHouse backend connection.
            </p>
          </div>
        </div>
      )}

      {/* Top Grid: Sessions by Hour & Commands by Day */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions by Hour */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Sessions by Hour</h2>
              <p className="text-xs text-gray-500">Temporal distribution (Last 24 Hours)</p>
            </div>
          </div>
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  formatter={(value: number) => [`${value.toLocaleString()} sessions`, 'Activity']}
                />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSessions)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Commands by Day */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Commands Captured by Day</h2>
              <p className="text-xs text-gray-500">Volume of attacker commands (Last 7 Days)</p>
            </div>
          </div>
          <div className="p-4 h-72">
            {commandsDailyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No daily command activity recorded in window
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commandsDailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value: number) => [`${value.toLocaleString()} commands`, 'Executions']}
                  />
                  <Bar dataKey="commands" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Middle Grid: Top Attack Intents & Top Countries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Attack Intents (Clean Donut Chart with Legend & Tooltip) */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Top Attack Intents</h2>
              <p className="text-xs text-gray-500">MITRE ATT&CK objective taxonomy (All-Time)</p>
            </div>
          </div>
          <div className="p-4 h-80">
            {intentData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
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
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    // Only label slices that are at least 5% to eliminate text collisions
                    label={({ name, percent }) =>
                      percent >= 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                    }
                  >
                    {intentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value: number, name: string) => [
                      `${value.toLocaleString()} events`,
                      name,
                    ]}
                  />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Attacker Countries (Horizontal Bar Chart with Full Names) */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Top Attacker Geographies</h2>
              <p className="text-xs text-gray-500">Country of origin by session count (All-Time)</p>
            </div>
          </div>
          <div className="p-4 h-80">
            {countryData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No geographic data recorded
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={countryData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#475569"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value: number) => [`${value.toLocaleString()} sessions`, 'Sessions']}
                  />
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
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Threat Distribution</h2>
              <p className="text-xs text-gray-500">Skill and risk classifications (All-Time)</p>
            </div>
            <span className="text-xs font-semibold text-gray-500">
              {totalThreatEvaluated.toLocaleString()} sessions
            </span>
          </div>
          <div className="p-4 h-72">
            {threatData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
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
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="level"
                    label={({ level, percent }) =>
                      percent >= 0.05 ? `${level} ${(percent * 100).toFixed(0)}%` : ''
                    }
                  >
                    {threatData.map((entry, index) => (
                      <Cell key={`threat-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value: number, name: string) => [
                      `${value.toLocaleString()} sessions (${totalThreatEvaluated > 0 ? ((value / totalThreatEvaluated) * 100).toFixed(1) : 0}%)`,
                      name,
                    ]}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sessions Over Time (Last 7 Days) */}
        <div className="card lg:col-span-2">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Sessions Over Time</h2>
              <p className="text-xs text-gray-500">Daily unique honeypot sessions (Last 7 Days)</p>
            </div>
          </div>
          <div className="p-4 h-72">
            {sessionsDailyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No daily session records in current window
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sessionsDailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value: number) => [`${value.toLocaleString()} sessions`, 'Sessions']}
                  />
                  <Line
                    type="monotone"
                    dataKey="sessions"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 7, strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Summary Statistics Card (All-Time Authoritative) */}
      <div className="card">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Summary Statistics (All-Time Authoritative)</h2>
          <p className="text-xs text-gray-500">Directly calculated from primary ClickHouse telemetry tables</p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Sessions</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalSessions.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Active Sessions</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{activeSessions.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Commands</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalCommands.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Unique Attackers</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{uniqueAttackers.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </main>
  );
}