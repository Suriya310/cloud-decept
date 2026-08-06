'use client';

import { useDashboardStore } from '@/lib/store';
import { useEffect } from 'react';
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
import { formatTimestamp } from '@/lib/utils';
import { format } from 'date-fns';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function AnalyticsPage() {
  const { stats, fetchStats, sessions, fetchSessions } = useDashboardStore();

  useEffect(() => {
    fetchStats();
    fetchSessions({ limit: 500 });
  }, [fetchStats, fetchSessions]);

  const intentData = Object.entries(
    sessions.flatMap((s) => s.intent_history).reduce((acc, intent) => {
      acc[intent] = (acc[intent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .sort(([, a], [, b]) => b - a)
    .map(([name, value], index) => ({ name: name.replace(/_/g, ' '), value, color: COLORS[index % COLORS.length] }));

  const countryData = Object.entries(
    sessions.reduce((acc, s) => {
      if (s.src_country) acc[s.src_country] = (acc[s.src_country] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value], index) => ({ name, value, color: COLORS[index % COLORS.length] }));

  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    const count = sessions.filter((s) => new Date(s.start_time).getHours() === i).length;
    return { hour: `${hour}:00`, sessions: count };
  });

  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().split('T')[0];
    const count = sessions.filter((s) => s.start_time.startsWith(dateStr)).length;
    return { date: format(date, 'MMM d'), sessions: count, dateStr };
  });

  const threatDistribution = stats?.threat_distribution || [
    { level: 'Critical', count: 0 },
    { level: 'High', count: 0 },
    { level: 'Medium', count: 0 },
    { level: 'Low', count: 0 },
  ];

  const threatColors = { Critical: '#ef4444', High: '#dc2626', Medium: '#f59e0b', Low: '#22c55e' };

  return (
    <div className="lg:ml-64 pt-16 min-h-screen bg-gray-50">
      <main className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">Session trends, geographic distribution, and attack patterns</p>
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
              <h2 className="text-lg font-semibold text-gray-900">Sessions by Day (Last 7 Days)</h2>
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
              <h2 className="text-lg font-semibold text-gray-900">Top Attack Intents</h2>
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
              <h2 className="text-lg font-semibold text-gray-900">Top Countries</h2>
            </div>
            <div className="p-4 h-80">
              {countryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} width={80} />
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
              <h2 className="text-lg font-semibold text-gray-900">Threat Level Distribution</h2>
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
              <h2 className="text-lg font-semibold text-gray-900">Commands Over Time (Last 7 Days)</h2>
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
            <h2 className="text-lg font-semibold text-gray-900">Summary Statistics</h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_sessions || sessions.length}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500">Active Sessions</p>
              <p className="text-2xl font-bold text-green-600">{stats?.active_sessions || sessions.filter((s) => s.status === 'active').length}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500">Total Commands</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_commands || 0}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500">Unique Attackers</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.unique_attackers || new Set(sessions.map((s) => s.src_ip)).size}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}