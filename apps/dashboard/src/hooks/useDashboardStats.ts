'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useDashboardStore } from '@/lib/store';

/**
 * Authoritative Statistics Hook for CloudDecept Dashboard.
 * Serves as the single source of truth for global metrics across Overview, Analytics, and Sessions,
 * preventing contradictory metrics and stale subset calculations.
 */
export function useDashboardStats(options: { autoRefreshIntervalMs?: number } = {}) {
  const {
    stats,
    statsLoading,
    statsError,
    fetchStats,
    connectionStatus,
    fetchConnectionStatus,
  } = useDashboardStore();

  const refresh = useCallback(async () => {
    // Canonical time window: default 24h (which returns all-time totals + 24h recent metrics + authoritative charts)
    await Promise.allSettled([
      fetchStats(24),
      fetchConnectionStatus(),
    ]);
  }, [fetchStats, fetchConnectionStatus]);

  useEffect(() => {
    if (!stats && !statsLoading && !statsError) {
      refresh();
    }
  }, [stats, statsLoading, statsError, refresh]);

  // Optional periodic background refresh
  useEffect(() => {
    if (!options.autoRefreshIntervalMs || options.autoRefreshIntervalMs <= 0) return;
    const interval = setInterval(refresh, options.autoRefreshIntervalMs);
    return () => clearInterval(interval);
  }, [options.autoRefreshIntervalMs, refresh]);

  const threatDistributionMap = useMemo(() => {
    const map: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unclassified: 0,
    };
    if (stats?.threat_distribution && Array.isArray(stats.threat_distribution)) {
      for (const item of stats.threat_distribution) {
        if (item && item.level) {
          map[item.level.toLowerCase()] = item.count || 0;
        }
      }
    }
    return map;
  }, [stats?.threat_distribution]);

  return {
    // Raw Stats Object
    stats,

    // Authoritative All-Time Global Metrics
    totalSessions: stats?.total_sessions ?? 0,
    totalCommands: stats?.total_commands ?? 0,
    uniqueAttackers: stats?.unique_attackers ?? 0,
    activeSessions: stats?.active_sessions ?? 0,

    // Authoritative Recent Window Metrics (Last 24h)
    recentSessions24h: stats?.recent_sessions ?? 0,
    recentCommands24h: stats?.recent_commands ?? 0,
    recentAttackers24h: stats?.recent_unique_attackers ?? 0,

    // Authoritative Chart Time-Series & Aggregations
    topIntents: stats?.top_intents ?? [],
    topCountries: stats?.top_countries ?? [],
    threatDistribution: threatDistributionMap,
    threatDistributionList: stats?.threat_distribution ?? [],
    sessionsPerHour: stats?.sessions_per_hour ?? [],
    commandsPerDay: stats?.commands_per_day ?? [],
    sessionsPerDay: stats?.sessions_per_day ?? [],

    // Connection & State
    isApiHealthy: connectionStatus?.connected ?? false,
    isLoading: statsLoading,
    isError: Boolean(statsError),
    error: statsError,
    refresh,
  };
}
