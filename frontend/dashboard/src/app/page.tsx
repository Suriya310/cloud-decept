'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity,
  Terminal,
  Shield,
  AlertTriangle,
  Users,
  Clock,
  TrendingUp,
  Globe,
  Database,
  Cpu,
  Network,
  Zap,
  Eye,
  Download,
  Filter,
  Search,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { MetricCard, ChartCard, SessionDurationChart, IntentDistributionChart, TacticChart, GeoAttackChart, LiveIndicator, ChartSkeleton } from '@/components/Charts';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Session {
  id: string;
  start_time: string;
  end_time?: string;
  duration: number;
  commands_count: number;
  attacker_ip: string;
  attacker_country: string;
  intent: string;
  status: 'active' | 'completed';
  cloud_provider: string;
}

export default function Dashboard() {
  const [timeRange, setTimeRange] = useState('24h');

  // Mock data for demo - in production this would come from ClickHouse
  const sessions: Session[] = [
    { id: 'sess_001', start_time: '2024-01-15T10:23:45Z', duration: 420, commands_count: 23, attacker_ip: '203.0.113.45', attacker_country: 'China', intent: 'cloud_recon', status: 'completed', cloud_provider: 'aws' },
    { id: 'sess_002', start_time: '2024-01-15T11:05:12Z', duration: 180, commands_count: 12, attacker_ip: '198.51.100.23', attacker_country: 'Russia', intent: 'credential_hunting', status: 'completed', cloud_provider: 'aws' },
    { id: 'sess_003', start_time: '2024-01-15T12:30:00Z', duration: 65, commands_count: 8, attacker_ip: '192.0.2.67', attacker_country: 'USA', intent: 'privilege_escalation', status: 'completed', cloud_provider: 'azure' },
    { id: 'sess_004', start_time: '2024-01-15T13:45:22Z', duration: 890, commands_count: 45, attacker_ip: '203.0.113.89', attacker_country: 'Brazil', intent: 'data_access', status: 'completed', cloud_provider: 'gcp' },
    { id: 'sess_005', start_time: '2024-01-15T14:12:10Z', duration: 340, commands_count: 18, attacker_ip: '198.51.100.45', attacker_country: 'India', intent: 'persistence', status: 'completed', cloud_provider: 'aws' },
    { id: 'sess_006', start_time: '2024-01-15T15:20:00Z', end_time: '2024-01-15T15:35:00Z', duration: 900, commands_count: 31, attacker_ip: '192.0.2.12', attacker_country: 'Germany', intent: 'lateral_movement', status: 'active', cloud_provider: 'azure' },
    { id: 'sess_007', start_time: '2024-01-15T15:45:00Z', end_time: '2024-01-15T15:50:00Z', duration: 360, commands_count: 15, attacker_ip: '203.0.113.12', attacker_country: 'France', intent: 'cloud_recon', status: 'active', cloud_provider: 'gcp' },
  ];

  const stats = {
    totalSessions: sessions.length,
    activeSessions: sessions.filter(s => s.status === 'active').length,
    avgDuration: Math.round(sessions.reduce((a, b) => a + b.duration, 0) / sessions.length),
    totalCommands: sessions.reduce((a, b) => a + b.commands_count, 0),
    uniqueIPs: new Set(sessions.map(s => s.attacker_ip)).size,
    countries: new Set(sessions.map(s => s.attacker_country)).size,
  };

  const intentCounts = sessions.reduce((acc, s) => {
    acc[s.intent] = (acc[s.intent] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar and Header are handled by layout */}

      <main className="lg:ml-64 p-4 lg:p-6">
        {/* Page Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Real-time monitoring of cloud deception honeypot
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            title="Total Sessions"
            value={stats.totalSessions}
            change={12}
            trend="up"
            icon={<Activity className="w-6 h-6" />}
            color="bg-primary-500"
          />
          <MetricCard
            title="Active Sessions"
            value={stats.activeSessions}
            change={0}
            trend="neutral"
            icon={<Zap className="w-6 h-6" />}
            color="bg-success-500"
          />
          <MetricCard
            title="Avg Duration"
            value={`${stats.avgDuration}s`}
            change={8}
            trend="up"
            icon={<Clock className="w-6 h-6" />}
            color="bg-warning-500"
          />
          <MetricCard
            title="Total Commands"
            value={stats.totalCommands}
            change={25}
            trend="up"
            icon={<Terminal className="w-6 h-6" />}
            color="bg-purple-500"
          />
        </div>

        {/* Second row metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <MetricCard
            title="Unique Attackers"
            value={stats.uniqueIPs}
            change={5}
            trend="up"
            icon={<Users className="w-6 h-6" />}
            color="bg-orange-500"
          />
          <MetricCard
            title="Countries"
            value={stats.countries}
            change={0}
            trend="neutral"
            icon={<Globe className="w-6 h-6" />}
            color="bg-cyan-500"
          />
          <MetricCard
            title="Intent Predictions"
            value={Object.keys(intentCounts).length}
            change={0}
            trend="neutral"
            icon={<Shield className="w-6 h-6" />}
            color="bg-pink-500"
          />
        </div>

        {/* Live Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <LiveIndicator label="Sessions/min" value="2.3" />
          <LiveIndicator label="Commands/sec" value="12.7" />
          <LiveIndicator label="Intent Accuracy" value="87" unit="%" />
          <LiveIndicator label="Adaptation Rate" value="64" unit="%" />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard title="Session Duration" subtitle="Average vs Maximum duration (seconds)">
            <SessionDurationChart />
          </ChartCard>
          <ChartCard title="Intent Distribution" subtitle="Attacker intent classification breakdown">
            <IntentDistributionChart />
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard title="MITRE ATT&CK Tactics" subtitle="Detected techniques by tactic">
            <TacticChart />
          </ChartCard>
          <ChartCard title="Top Attacker Countries" subtitle="Geographic distribution of sessions">
            <GeoAttackChart />
          </ChartCard>
        </div>

        {/* Recent Sessions */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Sessions</h2>
            <Link href="/sessions" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Session</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Time</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Attacker</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Duration</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Commands</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Intent</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Cloud</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 10).map((session) => (
                  <tr key={session.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono text-sm text-slate-600 dark:text-slate-300">{session.id}</td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">
                      {format(new Date(session.start_time), 'MMM d, HH:mm:ss')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-slate-600 dark:text-slate-300">{session.attacker_ip}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">({session.attacker_country})</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300 font-mono">{session.duration}s</td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300 font-mono">{session.commands_count}</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${getIntentBadgeColor(session.intent)} capitalize`}>
                        {session.intent.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${session.status === 'active' ? 'badge-success' : 'badge-gray'}`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge badge-primary capitalize`}>{session.cloud_provider}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function getIntentBadgeColor(intent: string): string {
  const colors: Record<string, string> = {
    cloud_recon: 'badge-primary',
    credential_hunting: 'badge-danger',
    privilege_escalation: 'badge-warning',
    data_access: 'badge-purple',
    persistence: 'badge-pink',
    lateral_movement: 'badge-cyan',
  };
  return colors[intent] || 'badge-gray';
}