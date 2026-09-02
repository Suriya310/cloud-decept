'use client';

import { cn, formatTimestamp, getIntentColor, getSeverityColor } from '@/lib/utils';
import { StatCard } from '@/components/StatCard';
import { useDashboardStore } from '@/lib/store';
import { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Users,
  Terminal,
  MapPin,
  Clock,
  Shield,
  TrendingUp,
  Database,
  Wifi,
  WifiOff,
  Server,
  BarChart2,
  PieChart,
  Target,
  Zap,
  Globe,
  Terminal as TerminalIcon,
  MapPin as MapPinIcon,
  Key,
  Sparkles,
  Zap as ZapIcon,
  Shield as ShieldIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useDashboardStore } from '@/lib/store';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import { useDashboardStore } from '@/lib/store';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const intentColors: Record<string, string> = {
  cloud_recon: 'bg-blue-100 text-blue-800',
  credential_hunting: 'bg-red-100 text-red-800',
  privilege_escalation: 'bg-orange-100 text-orange-800',
  data_access: 'bg-purple-100 text-purple-800',
  persistence: 'bg-amber-100 text-amber-800',
  lateral_movement: 'bg-pink-100 text-pink-800',
  unknown: 'bg-gray-100 text-gray-800',
};

const severityColors = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

function getSeverityColor(severity: string) {
  switch (severity.toLowerCase()) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    case 'high': return 'bg-red-100 text-red-800 border-red-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function getIntentColor(intent: string) {
  switch (intent.toLowerCase()) {
    case 'credential_access': return 'bg-red-100 text-red-800';
    case 'discovery': return 'bg-yellow-100 text-yellow-800';
    case 'lateral_movement': return 'bg-orange-100 text-orange-800';
    case 'persistence': return 'bg-amber-100 text-amber-800';
    case 'data_exfiltration': return 'bg-red-100 text-red-800';
    case 'resource_hijacking': return 'bg-pink-100 text-pink-800';
    case 'defense_evasion': return 'bg-indigo-100 text-indigo-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export default function OverviewPage() {
  const {
    stats,
    fetchStats,
    fetchAllTimeStats,
    sessions,
    fetchSessions,
    connectionStatus,
    fetchConnectionStatus,
    subscribeToEvents,
    realTimeEvents,
  } = useDashboardStore();

  const [autoRefresh, setAutoRefresh] = useState(true);

  const sessionsArray = sessions ?? [];
  const realTimeEventsArray = realTimeEvents ?? [];

  // Fetch stats for all-time totals
  useEffect(() => {
    fetchStats(87600); // 10 years = all-time
    fetchSessions({ limit: 500, hours: 8760 }); // ~1 year
    fetchConnectionStatus();
    const unsubscribe = subscribeToEvents();
    return unsubscribe;
  }, [fetchStats, fetchAllTimeStats, fetchSessions, fetchConnectionStatus, subscribeToEvents]);

  // Auto-refresh stats every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats(87600);
      fetchConnectionStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats, fetchConnectionStatus]);

  const sessionsArray = sessions ?? [];
  const realTimeEventsArray = realTimeEvents ?? [];

  // Use authoritative backend stats - all-time totals
  const totalSessions = stats?.total_sessions ?? 0;
  const activeSessions = stats?.active_sessions ?? 0;
  const totalCommands = stats?.total_commands ?? 0;
  const uniqueAttackers = stats?.unique_attackers ?? 0;
  const recentSessionsCount = stats?.recent_sessions ?? 0;

  const recentSessions = sessionsArray.slice(0, 5);
  const topIntents = stats?.top_intents ?? [];
  const topCountries = stats?.top_countries ?? [];
  const threatDistribution = stats?.threat_distribution ?? [];

  // Recent commands from sessions
  const recentCommands = sessionsArray
    .flatMap(s => (s.intent_history || []).map(intent => ({
      session_id: s.session_id,
      attacker_ip: s.src_ip ?? s.attacker_ip,
      country: s.src_country ?? s.country,
      intent: s.intent,
      threat_score: s.threat_score,
      start_time: s.start_time,
    })))
    .slice(0, 20);

  // Connection status
  const isApiHealthy = connectionStatus?.connected ?? false;
  const clickhouseStatus = connectionStatus?.clickhouse ?? 'unknown';
  const postgresStatus = connectionStatus?.postgres ?? 'unknown';
  const redisStatus = connectionStatus?.redis ?? 'unknown';

  // Recent sessions for table
  const recentSessions = sessionsArray.slice(0, 10);

  // Top commands from sessions
  const allCommands = sessionsArray.flatMap(s =>
    (s.commands || []).map(c => ({
      session_id: s.session_id,
      session_ip: s.src_ip ?? s.attacker_ip,
      command: c.command,
      timestamp: c.timestamp,
      output: c.output,
      exit_code: c.exit_code,
      intent: c.intent,
    }))
  ).slice(0, 20);

  // Auth attempts
  const authEvents = sessionsArray.flatMap(s =>
    (s.auth_attempts || []).map(a => ({
      session_id: s.session_id,
      attacker_ip: s.src_ip ?? s.attacker_ip,
      username: a.username,
      password: a.password,
      success: a.success,
      timestamp: a.timestamp,
      auth_method: a.auth_method,
    }))
  ).slice(0, 20);

  // Threat sessions
  const threatSessions = sessionsArray.filter(s => (s.threat_score ?? 0) > 0);
  const highThreatSessions = sessionsArray.filter(s => (s.threat_score ?? 0) >= 70);
  const mediumThreatSessions = sessionsArray.filter(s => (s.threat_score ?? 0) >= 40 && (s.threat_score ?? 0) < 70);

  // Intent distribution
  const intentCounts = sessionsArray.flatMap(s => s.intent_history ?? []).reduce((acc, intent) => {
    acc[intent] = (acc[intent] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Country data
  const countryCounts = sessionsArray.reduce((acc, s) => {
    const country = s.src_country || s.country || 'Unknown';
    acc[country] = (acc[country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Format timestamp helper
  const formatTimestamp = (ts: string | number | Date) => {
    if (!ts) return '—';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Compute command stats
  const totalCommands = stats?.total_commands ?? 0;
  const uniqueAttackers = stats?.unique_attackers ?? 0;
  const totalSessions = stats?.total_sessions ?? 0;
  const activeSessions = stats?.active_sessions ?? 0;
  const totalCommandsCount = stats?.total_commands ?? 0;
  const uniqueAttackersCount = stats?.unique_attackers ?? 0;
  const recentSessionsCount = stats?.recent_sessions ?? 0;
  const activeSessionsCount = stats?.active_sessions ?? 0;
  const totalCommandsCount = stats?.total_commands ?? 0;
  const uniqueAttackersCount = stats?.unique_attackers ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-gray-200 flex items-center px-6">
        <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 011.427 2.054 11.955 11.955 0 01-2.92 7.07 11.955 11.955 0 01-1.42-.794 11.955 11.955 0 01-5.823 0 11.955 11.955 0 01.42-4.06 11.955 11.955 0 013.868 0 11.955 11.955 0 012.92 1.786A1 1 0 0118 9.292v4.012a1 1 0 01-.335.942l-2.5 2.5a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0 1.414 0 3.293-2.293a1 1 0 011.414 0l2 2a1 1 0 01-.707 1.707l-5 5a1 1 0 01-1.414 0l-3.5 3.5a1 1 0 01-1.414 0l-1.5-1.5a1 1 0 010-1.414l4-4a1 1 0 011.414-1.414H5.626c-.593 0-1.072-.473-.994-1.06l1.5-6a.5.5 0 01.176-.553h2.5a.5.5 0 01.5.5v12a.5.5 0 01-.5.5h-11a.5.5 0 01-.5-.5V6.5a.5.5 0 01.5-.5h3.5a.5.5 0 010-1H9a1 1 0 00-1-1H6a1 1 0 00-1 1v2.5a2.5 2.5 0 001.405 2.19l3.5 3.5a.5.5 0 00.707 0l2.429-2.429a.5.5 0 11.707.707l3.5-3.5a.5.5 0 01.707 0l.5.5a.5.5 0 01-.5.5h-11a1 1 0 01-1-1v-10a1 1 0 011-1h14a1 1 0 011 1v7.5a1 1 0 102 0v1.5a1 1 0 01-1 1h-13a1 1 0 01-1-1v-9a1 1 0 011-1h18a1 1 0 011 1v1a1 1 0 01-1 1H4.5a1 1 0 00-.72.32l-2 2a.5.5 0 01-.7.7l-1.5-1.5a.5.5 0 00-.7-.7l-1.5 1.5a.5.5 0 01-.7.7l-1-1a.5.5 0 01-.7-.7L2 12.5c-.276 0-.5-.224-.5-.5s.224-.5.5-.5H4V4a2 2 0 012-2h2.5a.5.5 0 010 1H5a1 1 0 00-1 1v1a1 1 0 01-1 1H2.5a.5.5 0 000 1H4a1 1 0 000 2h16a1 1 0 001-1v-4a2 2 0 00-2-2h-3.5a.5.5 0 01-.353-.854l1.5-2a.5.5 0 01.886-.146l2 2.002a.5.5 0 01-.146.886h-1.5a.5.5 0 00-.354.854l-3.5 3.5a.5.5 0 11-.707-.707L14 9.707l-2.5-2.5a.5.5 0 10-.707-.707l-.5-.5a.5.5 0 00-.354-.146H4.5a.5.5 0 00-.354.146l-1.5 2a.5.5 0 01-.854.354L3 6.5a.5.5 0 00.5.5h17a.5.5 0 00.5-.5v-1a.5.5 0 01.5-.5h2a.5.5 0 010-1H6a1 1 0 01-1-1V4.5a1 1 0 011-1h1c0-.552.448-1 1-1h10c.553 0 1 .448 1 1v1c0 .553-.447 1-1 1H5.5a.5.5 0 00-.354.854l-3.5 3.5a.5.5 0 11-.707.707l-2.5-2.5a.5.5 0 10-.707.707l-.5.5a.5.5 0 01-.354.146H4.5a.5.5 0 00-.354.854l1.5 2a.5.5 0 01-.354.854L3 13.5a.5.5 0 00.5.5h16a.5.5 0 010 1H4.5a.5.5 0 00-.5.5v1a.5.5 0 00.5.5H7a1 1 0 010 2h1c0 .552.448 1 1 1h1c.552 0 1-.448 1-1v-1c0-.552-.448-1-1-1H5.5a.5.5 0 00-.354.854l-3.5 3.5a.5.5 0 11-.707.707l-2.5 2.5a.5.5 0 10.707.707l.5.5a.5.5 0 01-.354.146H4.5a.5.5 0 00-.354.146l1.5 2a.5.5 0 01-.354.854L4.5 24.5a.5.5 0 01-.5.5H4V20a2 2 0 01-2 2H2.5a.5.5 0 010-1H3a1 1 0 000 2h18a1 1 0 001-1v-1c0-.553-.447-1-1-1h-1a.5.5 0 01-.5-.5V20a2 2 0 01-2 2h-4a2 2 0 01-2-2v-6.5a.5.5 0 01.5-.5h11a.5.5 0 000-1H5a.5.5 0 01-.707-.293l-1.5-1.5a.5.5 0 01-.293-.707L5.5 5.793a.5.5 0 01.707-.707l2.5-2.5a.5.5 0 01.707 0l.5-.5a.5.5 0 01.354-.146H7.5a.5.5 0 010-1H4.5a.5.5 0 01-.354-.146L2.5 3.293a.5.5 0 00-.707.707l-.5.5a.5.5 0 01-.354.146H3.5a.5.5 0 00-.5.5v1a.5.5 0 00.5.5h1a.5.5 2.5.5 0 01.5.5v1a.5.5 0 00.5.5h13a.5.5 0 00.5-.5v-1a.5.5 0 00-.5-.5h-1a.5.5 0 01-.5-.5V1.5a.5.5 0 01.5-.5h2c0-.552.448-1 1-1h1c.552 0 1 .448 1 1v1c0 .553-.447 1-1 1H5.5a.5.5 0 00-.354.854l-3.5 3.5a.5.5 0 11-.707.707l-2.5 2.5a.5.5 0 01-.707 0l-.5-.5a.5.5 0 01-.354-.146H2.5a.5.5 0 00-.5.5v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 10-1 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5H2.5a.5.5 0 111 0v1a.5.5 0 00.5.5h1a.5.5 0 00.5-.5V1.5a.5.5 0 00-.5-.5z" fill="currentColor"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">CLOUDDECEPT</h1>
                <p className="text-xs text-gray-500">Adaptive Cloud Deception & Threat Intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'px-2 py-1 rounded-full text-xs font-medium',
                  isApiHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                )}>
                  {isApiHealthy ? '● SYSTEM ONLINE' : '○ SYSTEM OFFLINE'}
                </span>
              </div>
              <button
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                aria-label="Refresh"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="pt-20 pb-8 px-6 max-w-7xl mx-auto space-y-6">
          {/* Alert banner if API unhealthy */}
          {!isApiHealthy && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-yellow-800">Backend API disconnected</p>
                <p className="text-sm text-yellow-700">Showing cached data. Some features may be limited.</p>
              </div>
            </div>
          )}

          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Active Sessions"
              value={activeSessions}
              icon={<ShieldIcon className="w-6 h-6" />}
              iconBg="bg-red-100"
              iconColor="text-red-600"
              trend="up"
            />
            <StatCard
              title="Total Sessions (All-Time)"
              value={totalSessions.toLocaleString()}
              icon={<Users className="w-6 h-6" />}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              trend="up"
            />
            <StatCard
              title="Total Commands"
              value={totalCommandsCount.toLocaleString()}
              icon={<Terminal className="w-6 h-6" />}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              trend="up"
            />
            <StatCard
              title="Unique Attackers"
              value={uniqueAttackers.toLocaleString()}
              icon={<Users className="w-6 h-6" />}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
              trend="up"
            />
            <StatCard
              title="Commands (24h)"
              value={recentSessionsCount.toLocaleString()}
              icon={<Terminal className="w-6 h-6" />}
              iconBg="bg-green-100"
              iconColor="text-green-600"
            />
            <StatCard
              title="Auth Attempts"
              value={authEvents.length.toLocaleString()}
              icon={<Key className="w-6 h-6" />}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* LEFT PANEL - Live Attack Activity */}
            <div className="lg:col-span-2 space-y-6">
              {/* Live Attack Activity */}
              <div className="card">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <Activity className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">LIVE ATTACK ACTIVITY</h2>
                      <p className="text-xs text-gray-500">Real-time event stream from honeypot</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-600">Auto-refresh (30s)</span>
                    </label>
                    <span className="text-xs text-green-600 font-medium">LIVE</span>
                  </div>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto scrollbar-thin">
                  {realTimeEventsArray.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Activity className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500">Waiting for live events...</p>
                      <p className="text-xs text-gray-400 mt-1">Connect to Cowrie SSH (port 2222) to generate activity</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {realTimeEventsArray.slice(0, 30).map((event, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                            <Activity className="w-4 h-4 text-primary-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-900 capitalize">
                                {event.type?.replace(/_/g, ' ') || 'event'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(event.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <pre className="text-xs text-gray-600 mt-1 overflow-x-auto max-h-20 text-wrap">
                              {JSON.stringify(event.data, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Attacker Intelligence & Intent Analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Attacker Intelligence */}
                <div className="card">
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">ATTACKER INTELLIGENCE</h2>
                    <span className="text-xs text-gray-500">{sessionsArray.length} sessions analyzed</span>
                  </div>
                  <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                    {sessionsArray.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No attacker data available</p>
                        <p className="text-xs text-gray-400 mt-1">Connect to SSH honeypot (port 2222) to generate data</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {sessionsArray
                          .filter(s => s.src_ip || s.attacker_ip)
                          .sort((a, b) => (b.command_count || 0) - (a.command_count || 0))
                          .slice(0, 10)
                          .map((session) => (
                            <Link
                              key={session.session_id}
                              href={`/sessions/${session.session_id}`}
                              className="block p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                    <MapPin className="w-5 h-5 text-gray-500" />
                                  </div>
                                  <div>
                                    <p className="font-mono text-sm font-medium text-gray-900">
                                      {session.src_ip ?? session.attacker_ip ?? 'unknown'}
                                    </p>
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                      <MapPinIcon className="w-3 h-3" />
                                      <span>{session.src_country || session.country || 'Unknown'}</span>
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <p className="text-sm font-medium text-gray-900">
                                      {(session.command_count ?? 0).toLocaleString()}
                                    </p>
                                    <p className="text-xs text-gray-500">commands</p>
                                  </div>
                                  <div className="text-right">
                                    <span className={cn(
                                      'badge text-xs',
                                      (session.threat_score ?? 0) >= 70 ? 'bg-red-100 text-red-800' :
                                      (session.threat_score ?? 0) >= 40 ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-green-100 text-green-800'
                                    )}>
                                      {(session.threat_score ?? 0)}/100
                                    </span>
                                    <p className="text-xs text-gray-500 mt-1">
                                      {formatTimestamp(session.start_time)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    )}
                  </div>
                </div>

                {/* Intent Analysis */}
                <div className="card">
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">INTENT ANALYSIS</h2>
                    <span className="text-xs text-gray-500">MITRE ATT&CK Mapping</span>
                  </div>
                  <div className="p-4">
                    {Object.keys(intentCounts).length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <Target className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No intent data available</p>
                        <p className="text-xs text-gray-400 mt-1">Intent classification requires AI analysis</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(intentCounts)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 8)
                          .map(([intent, count], index) => (
                            <div key={intent} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
                                <span
                                  className={cn('badge text-xs', getIntentColor(intent))}
                                >
                                  {intent.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary-600 rounded-full transition-all"
                                    style={{
                                      width: `${(intentCounts[intent] / (Math.max(...Object.values(intentCounts)) || 1)) * 100}%`
                                    }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-gray-900 w-12 text-right">
                                  {intentCounts[intent]}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    )}
                  </div>
                </div>
              </div>

              {/* Geographic Distribution */}
              <div className="card lg:col-span-2">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">GEOGRAPHIC DISTRIBUTION</h2>
                  <span className="text-xs text-gray-500">Top attacker countries</span>
                </div>
                <div className="p-4 space-y-3">
                  {Object.entries(countryCounts).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Globe className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500">No geographic data available</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(countryCounts)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 10)
                        .map(([country, count], index) => (
                          <div key={country} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
                              <span className="text-sm font-medium text-gray-900">{country}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary-600 rounded-full transition-all"
                                  style={{ width: `${(countryCounts[country] / Math.max(...Object.values(countryCounts))) * 100}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium text-gray-900 w-12 text-right">
                                {count.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* COMMANDS & THREAT ANALYSIS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Commands Panel */}
              <div className="card lg:col-span-2">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">RECENT COMMANDS</h2>
                  <span className="text-xs text-gray-500">{allCommands.length} commands captured</span>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto">
                  {allCommands.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Terminal className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500">No commands captured yet</p>
                      <p className="text-xs text-gray-400 mt-1">SSH into honeypot (port 2222) to generate commands</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {allCommands.slice(0, 30).map((cmd, index) => (
                        <div
                          key={`${cmd.session_id}-${index}`}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Terminal className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <code className="text-sm font-mono text-gray-900 truncate block max-w-xs">
                                {cmd.command}
                              </code>
                              <span className="text-xs text-gray-500">
                                {cmd.session_id.slice(0, 8)}...
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{formatTimestamp(cmd.timestamp)}</span>
                              <span className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">
                                {cmd.exit_code === 0 ? 'Success' : 'Failed'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  )}
                </div>

                {/* Threat Intelligence / AI Analysis */}
                <div className="card lg:col-span-2">
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">AI THREAT ANALYSIS</h2>
                    <span className="text-xs text-gray-500">Intent Engine + Threat Intel</span>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Recent High Threat Sessions */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">High-Risk Sessions</h3>
                      {highThreatSessions.length === 0 ? (
                        <p className="text-gray-500 text-sm py-4 text-center">No high-risk sessions detected</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {highThreatSessions.slice(0, 5).map((session) => (
                            <Link
                              key={session.session_id}
                              href={`/sessions/${session.session_id}`}
                              className="block p-3 bg-red-50 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-mono text-xs text-gray-900">{session.session_id.slice(0, 12)}...</p>
                                  <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {session.src_ip || session.attacker_ip || 'unknown'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="badge font-mono bg-red-100 text-red-800">
                                    {(session.threat_score ?? 0)}/100
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {formatTimestamp(session.start_time)}
                                  </span>
                                </div>
                              </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Intent Distribution */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Intent Distribution</h3>
                      {Object.keys(intentCounts).length === 0 ? (
                        <p className="text-gray-500 text-sm py-2">No intent data available</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(intentCounts)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 6)
                            .map(([intent, count]) => (
                              <div key={intent} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                <span className={cn('badge text-xs', getIntentColor(intent))}>
                                  {intent.replace(/_/g, ' ')}
                                </span>
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary-600 rounded-full"
                                      style={{ width: `${(intentCounts[intent] / (Math.max(...Object.values(intentCounts)) || 1)) * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-medium text-gray-900 w-8 text-right">
                                    {count}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Adaptive Response */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Adaptive Response</h3>
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-blue-900">Adaptive Engine Active</p>
                            <p className="text-xs text-blue-700">Automated deception responses enabled</p>
                          </div>
                          <span className="badge bg-blue-100 text-blue-800 ml-auto">ACTIVE</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Commands Terminal Panel */}
            <div className="card">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-gray-600" />
                  RECENT COMMANDS
                </h2>
                <button className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto bg-gray-900 rounded-lg font-mono text-green-300 text-sm">
                {allCommands.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Terminal className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <p>No commands captured yet</p>
                    <p className="text-xs mt-1">SSH to port 2222 to generate activity</p>
                  </div>
                ) : (
                  <div className="space-y-1 font-mono">
                    {allCommands.slice(0, 20).map((cmd, index) => (
                      <div key={`${cmd.session_id}-${index}`} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 w-20">{formatTimestamp(cmd.timestamp)}</span>
                        <span className="text-gray-400 w-16 truncate">{cmd.session_id.slice(0, 8)}</span>
                        <span className="text-green-400 font-mono">{cmd.command}</span>
                        <span className="text-gray-500 text-xs">{cmd.output ? cmd.output.slice(0, 40) + '...' : 'no output'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OverviewPage;