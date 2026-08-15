'use client';

import { useDashboardStore } from '@/lib/store';
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
} from 'recharts';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function AnalyticsPage() {
  const { stats, fetchStats, fetchAllTimeStats, sessions, fetchSessions, connectionStatus, fetchConnectionStatus } = useDashboardStore();

  useEffect(() => {
    fetchAllTimeStats();
    // Use large hours window to get all historical sessions
    fetchSessions({ limit: 1000, hours: 8760 });
    fetchConnectionStatus();
  }, [fetchStats, fetchAllTimeStats, fetchSessions, fetchConnectionStatus]);

  const sessionsArray = sessions ?? [];

  // Use authoritative backend stats - all-time totals
  const totalSessions = stats?.total_sessions ?? 0;
  const activeSessions = stats?.active_sessions ?? 0;
  const totalCommands = stats?.total_commands ?? 0;
  const uniqueAttackers = stats?.unique_attackers ?? 0;

  // Safe computation of intent data from backend stats if available, otherwise from sessions
  const intentData = useMemo(() => {
    if (stats?.top_intents && stats.top_intents.length > 0) {
      return stats.top_intents.map((item, index) => ({
        name: item.intent.replace(/_/g, ' '),
        value: item.count,
        color: COLORS[index % COLORS.length],
      }));
    }
    // Fallback to computing from sessions
    const intentCounts: Record<string, number> = {};
    sessionsArray.forEach((s) => {
      (s.intent_history || []).forEach((intent) => {
        intentCounts[intent] = (intentCounts[intent] || 0) + 1;
      });
    });
    return Object.entries(intentCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value], index) => ({ name: name.replace(/_/g, ' '), value, color: COLORS[index % COLORS.length] }));
  }, [sessionsArray, stats?.top_intents]);

  // Safe computation of country data from backend stats if available, otherwise from sessions
  const countryData = useMemo(() => {
    if (stats?.top_countries && stats.top_countries.length > 0) {
      return stats.top_countries.slice(0, 8).map((item, index) => ({
        name: item.country,
        value: item.count,
        color: COLORS[index % COLORS.length],
      }));
    }
    // Fallback to computing from sessions
    const countryCounts: Record<string, number> = {};
    sessionsArray.forEach((s) => {
      const country = s.src_country || s.country;
      if (country) countryCounts[country] = (countryCounts[country] || 0) + 1;
    });
    return Object.entries(countryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, value], index) => ({ name, value, color: COLORS[index % COLORS.length] }));
  }, [sessionsArray, stats?.top_countries]);

  // Safe hourly data from backend if available
  const hourlyData = useMemo(() => {
    if (stats?.sessions_per_hour && stats.sessions_per_hour.length > 0) {
      return stats.sessions_per_hour.map((item) => ({
        hour: item.hour,
        sessions: item.count,
      }));
    }
    // Fallback to computing from sessions
    return Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, '0');
      const count = sessionsArray.filter((s) => {
        const dt = new Date(s.start_time);
        return !isNaN(dt.getTime()) && dt.getHours() === i;
      }).length;
      return { hour: `${hour}:00`, sessions: count };
    });
  }, [sessionsArray, stats?.sessions_per_hour]);

  // Safe daily data from backend if available
  const dailyData = useMemo(() => {
    if (stats?.commands_per_day && stats.commands_per_day.length > 0) {
      return stats.commands_per_day.map((item) => ({
        date: format(new Date(item.date + 'T00:00:00'), 'MMM d'),
        sessions: item.count,
        dateStr: item.date,
      }));
    }
    // Fallback to computing from sessions
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dateStr = date.toISOString().split('T')[0];
      const count = sessionsArray.filter((s) => s.start_time?.startsWith(dateStr)).length;
      return { date: format(date, 'MMM d'), sessions: count, dateStr };
    });
  }, [sessionsArray, stats?.commands_per_day]);

  const threatDistribution = useMemo(() => {
    const base = stats?.threat_distribution ?? [
      { level: 'Critical', count: 0 },
      { level: 'High', count: 0 },
      { level: 'Medium', count: 0 },
      { level: 'Low', count: 0 },
    ];
    return Array.isArray(base) ? base : [];
  }, [stats?.threat_distribution]);

  const threatColors = { Critical: '#ef4444', High: '#dc2626', Medium: '#f59e0b', Low: '#22c55e' };

  // Connection status
  const isApiHealthy = connectionStatus?.connected ?? false;

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 mt-1">Session trends, geographic distribution, and attack patterns</p>
      </div>

      {/* Connection status indicator */}
      <div className={cn('p-3 rounded-lg flex items-center gap-3', isApiHealthy ? 'bg-green-50' : 'bg-red-50')}>
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', isApiHealthy ? 'bg-green-100' : 'bg-red-100')}>
          {isApiHealthy ? <span className="w-2 h-2 rounded-full bg-green-600" /> : <span className="w-2 h-2 rounded-full bg-red-600" />}
        </div>
        <span className="text-sm font-medium text-gray-900">
          {isApiHealthy ? 'Backend Connected - Using authoritative all-time stats' : 'Backend Disconnected - Showing local computations'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Sessions by Hour (Last 24h)</h2>
          </div>
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  labelFormatter={(label) => `${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSessions)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Commands by Day (Last 7 Days)</h2>
          </div>
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Top Attack Intents (All-Time)</h2>
          </div>
          <div className="p-4 h-80">
            {intentData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={intentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {intentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value: number) => [value.toLocaleString(), 'sessions']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                No intent data available
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Top Countries (All-Time)</h2>
          </div>
          <div className="p-4 h-80">
            {countryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={countryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} width={100} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                No geographic data available
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Threat Level Distribution (All-Time)</h2>
          </div>
          <div className="p-4 h-64">
            {threatDistribution.some((t) => t.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={threatDistribution.filter((t) => t.count > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="level"
                    label={({ level, percent }) => `${level} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {threatDistribution
                      .filter((t) => t.count > 0)
                      .map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={threatColors[entry.level as keyof typeof threatColors] || COLORS[index]} />
                      ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value: number) => [value.toLocaleString(), 'sessions']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                No threat data available
              </div>
            )}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Sessions Over Time (Last 7 Days)</h2>
          </div>
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="sessions"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ fill: '#f59e0b', strokeWidth: 2, r: 5 }}
                  activeDot={{ r: 8, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Summary Statistics (All-Time)</h2>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Total Sessions</p>
            <p className="text-2xl font-bold text-gray-900">{totalSessions.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Active Sessions</p>
            <p className="text-2xl font-bold text-green-600">{activeSessions.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Total Commands</p>
            <p className="text-2xl font-bold text-gray-900">{totalCommands.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Unique Attackers</p>
            <p className="text-2xl font-bold text-gray-900">{uniqueAttackers.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </main>
  );
}