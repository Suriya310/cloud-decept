'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  Legend
} from 'recharts';
import { format, subDays, subHours } from 'date-fns';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Shield, Network, Cpu, Database } from 'lucide-react';

// Colors for charts
const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  color: string;
}

export function MetricCard({ title, value, change = 0, trend = 'neutral', icon, color }: MetricCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-success-600' : trend === 'down' ? 'text-danger-600' : 'text-slate-500';

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{title}</p>
          <p className="stat-value">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
          {icon}
        </div>
      </div>
      {change !== undefined && (
        <div className="mt-3 flex items-center gap-1">
          <TrendIcon className={`w-4 h-4 ${trendColor}`} />
          <span className={`text-sm font-medium ${trendColor}`}>
            {change > 0 ? '+' : ''}{change}% vs last hour
          </span>
        </div>
      )}
    </div>
  );
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, children, className }: ChartCardProps) {
  return (
    <div className={`card ${className || ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      <div className="h-64">{children}</div>
    </div>
  );
}

// Session Duration Chart
export function SessionDurationChart() {
  const data = [
    { time: '00:00', avg: 120, max: 450 },
    { time: '04:00', avg: 80, max: 320 },
    { time: '08:00', avg: 200, max: 600 },
    { time: '12:00', avg: 350, max: 800 },
    { time: '16:00', avg: 280, max: 700 },
    { time: '20:00', avg: 180, max: 500 },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} />
        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          formatter={(value: number) => [value, 'seconds']}
        />
        <Area type="monotone" dataKey="avg" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorAvg)" strokeWidth={2} />
        <Area type="monotone" dataKey="max" stroke="#f59e0b" fillOpacity={1} fill="url(#colorMax)" strokeWidth={2} />
        <Legend />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Intent Distribution Chart
const INTENT_DATA = [
  { name: 'Cloud Recon', value: 45, color: '#0ea5e9' },
  { name: 'Credential Hunting', value: 22, color: '#ef4444' },
  { name: 'Privilege Escalation', value: 12, color: '#f59e0b' },
  { name: 'Data Access', value: 10, color: '#8b5cf6' },
  { name: 'Persistence', value: 7, color: '#ec4899' },
  { name: 'Lateral Movement', value: 4, color: '#06b6d4' },
];

export function IntentDistributionChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={INTENT_DATA}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {INTENT_DATA.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          formatter={(value: number) => [value, 'sessions']}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// MITRE ATT&CK Tactic Chart
const TACTIC_DATA = [
  { tactic: 'Discovery', count: 34, severity: 'low' },
  { tactic: 'Credential Access', count: 22, severity: 'critical' },
  { tactic: 'Initial Access', count: 18, severity: 'high' },
  { tactic: 'Lateral Movement', count: 12, severity: 'high' },
  { tactic: 'Persistence', count: 10, severity: 'high' },
  { tactic: 'Execution', count: 8, severity: 'medium' },
  { tactic: 'Exfiltration', count: 5, severity: 'high' },
  { tactic: 'Defense Evasion', count: 4, severity: 'high' },
];

export function TacticChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={TACTIC_DATA} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} />
        <YAxis type="category" dataKey="tactic" stroke="#94a3b8" fontSize={12} tickLine={false} width={120} />
        <Tooltip
          contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          formatter={(value: number) => [value, 'detections']}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {TACTIC_DATA.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.severity === 'critical' ? '#ef4444' : entry.severity === 'high' ? '#f59e0b' : entry.severity === 'medium' ? '#3b82f6' : '#22c55e'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Geographic Attack Map (simplified as chart)
const GEO_DATA = [
  { country: 'China', attacks: 89, risk: 'high' },
  { country: 'Russia', attacks: 67, risk: 'high' },
  { country: 'USA', attacks: 45, risk: 'medium' },
  { country: 'Brazil', attacks: 34, risk: 'medium' },
  { country: 'India', attacks: 28, risk: 'medium' },
  { country: 'Germany', attacks: 23, risk: 'low' },
  { country: 'France', attacks: 19, risk: 'low' },
  { country: 'UK', attacks: 15, risk: 'low' },
];

export function GeoAttackChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={GEO_DATA} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} />
        <YAxis type="category" dataKey="country" stroke="#94a3b8" fontSize={12} tickLine={false} width={80} />
        <Tooltip
          contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          formatter={(value: number) => [value, 'sessions']}
        />
        <Bar dataKey="attacks" radius={[0, 4, 4, 0]}>
          {GEO_DATA.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.risk === 'high' ? '#ef4444' : entry.risk === 'medium' ? '#f59e0b' : '#22c55e'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Loading skeleton for charts
export function ChartSkeleton() {
  return (
    <div className="h-64 animate-pulse">
      <div className="h-8 w-3/4 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
      <div className="h-full bg-slate-100 dark:bg-slate-800 rounded" />
    </div>
  );
}

// Real-time metric indicators
export function LiveIndicator({ label, value, unit = '' }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
      <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <span className="font-mono font-semibold text-slate-900 dark:text-white ml-auto">
        {value}{unit}
      </span>
    </div>
  );
}