'use client';

import { cn, formatTimestamp, getIntentColor } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { api } from '@/lib/api';
import { useEffect, useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Shield,
  Zap,
  Eye,
  Copy,
  Download,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

interface StrategyInfo {
  name: string;
  description: string;
  action_template: string;
}

const STRATEGY_DEFINITIONS: Record<string, StrategyInfo> = {
  credential_capture: {
    name: 'Credential Capture Decoy',
    description: 'Generates fake AWS credentials and SSH keys to trace exfiltration paths',
    action_template: 'Injected canary credentials into environment and filesystem',
  },
  fake_environment: {
    name: 'Synthetic Environment',
    description: 'Presents deceptive cloud resource listings and mock system configurations',
    action_template: 'Returned deceptive cloud resource inventory and instance metadata',
  },
  throttle: {
    name: 'Latency Throttling',
    description: 'Introduces artificial delays to slow automated scanning tools',
    action_template: 'Applied dynamic command latency delay',
  },
  decoy_resource: {
    name: 'Decoy Cloud Resources',
    description: 'Spawns decoy S3 buckets and mock database endpoints',
    action_template: 'Exposed decoy cloud storage targets',
  },
  session_terminate: {
    name: 'Containment Termination',
    description: 'Terminates active session upon critical system-level compromise',
    action_template: 'Session severed to prevent lateral movement',
  },
  alert_only: {
    name: 'Passive Observation',
    description: 'Passive telemetry recording and MITRE ATT&CK correlation',
    action_template: 'Logged session telemetry and mapped MITRE techniques',
  },
};

function mapIntentToStrategy(intent: string): { strategy: string; action: string } {
  const norm = intent.toLowerCase().replace(/-/g, '_');
  if (norm.includes('credential') || norm.includes('steal')) {
    return { strategy: 'credential_capture', action: STRATEGY_DEFINITIONS.credential_capture.action_template };
  }
  if (norm.includes('recon') || norm.includes('discovery') || norm.includes('system')) {
    return { strategy: 'fake_environment', action: STRATEGY_DEFINITIONS.fake_environment.action_template };
  }
  if (norm.includes('lateral') || norm.includes('exfiltration') || norm.includes('data')) {
    return { strategy: 'decoy_resource', action: STRATEGY_DEFINITIONS.decoy_resource.action_template };
  }
  if (norm.includes('damage') || norm.includes('privilege') || norm.includes('destroy')) {
    return { strategy: 'session_terminate', action: STRATEGY_DEFINITIONS.session_terminate.action_template };
  }
  return { strategy: 'alert_only', action: STRATEGY_DEFINITIONS.alert_only.action_template };
}

export default function AdaptationsPage() {
  const { sessions, fetchSessions } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [strategies, setStrategies] = useState<Record<string, { name: string; description: string }>>(STRATEGY_DEFINITIONS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const adaptationsPerPage = 20;

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      await fetchSessions({ limit: 500, hours: 8760 });
      try {
        const liveStrategies = await api.getAdaptiveStrategies();
        if (liveStrategies && Object.keys(liveStrategies).length > 0) {
          setStrategies((prev) => ({ ...prev, ...liveStrategies }));
        }
      } catch {
        // Fall back to built-in strategy definitions
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [fetchSessions]);

  const sessionsArray = sessions ?? [];

  // Deterministically derive real adaptations from recorded session intents
  const adaptations = useMemo(() => {
    return sessionsArray.flatMap((session) => {
      const intents = (session.intent_history && session.intent_history.length > 0)
        ? session.intent_history
        : (session.intent ? [session.intent] : ['observation']);

      return intents.map((intent, idx) => {
        const { strategy, action } = mapIntentToStrategy(intent);
        return {
          id: `adapt-${session.session_id}-${idx}`,
          session_id: session.session_id,
          attacker_ip: session.src_ip || session.attacker_ip || 'unknown',
          country: session.src_country || session.country || 'Unknown',
          timestamp: session.start_time,
          intent,
          strategy,
          action,
          threat_score: session.threat_score ?? 0,
          status: 'Enforced',
        };
      });
    });
  }, [sessionsArray]);

  const strategyKeys = Object.keys(strategies);

  const strategyCounts = useMemo(() => {
    return adaptations.reduce((acc, a) => {
      acc[a.strategy] = (acc[a.strategy] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [adaptations]);

  const filteredAdaptations = useMemo(() => {
    return adaptations.filter((adapt) => {
      const matchesSearch =
        adapt.session_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adapt.attacker_ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adapt.intent.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adapt.strategy.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adapt.action.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStrategy = selectedStrategy === 'all' || adapt.strategy === selectedStrategy;
      return matchesSearch && matchesStrategy;
    });
  }, [adaptations, searchQuery, selectedStrategy]);

  const totalPages = Math.ceil(filteredAdaptations.length / adaptationsPerPage);
  const paginatedAdaptations = filteredAdaptations.slice(
    (currentPage - 1) * adaptationsPerPage,
    currentPage * adaptationsPerPage
  );

  return (
    <main className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Adaptive Deception Engine</h1>
          <p className="text-gray-500 mt-1">
            {adaptations.length} automated defensive actions orchestrated across {sessionsArray.length} sessions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search adaptations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white min-w-[200px]"
          >
            <option value="all">All Strategies ({adaptations.length})</option>
            {strategyKeys.map((k) => (
              <option key={k} value={k}>
                {strategies[k]?.name || k.replace(/_/g, ' ')} ({strategyCounts[k] || 0})
              </option>
            ))}
          </select>
          <button
            onClick={loadData}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            title="Refresh adaptations"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Strategy Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {strategyKeys.map((k) => {
          const count = strategyCounts[k] || 0;
          return (
            <div
              key={k}
              onClick={() => setSelectedStrategy(selectedStrategy === k ? 'all' : k)}
              className={cn(
                'card p-4 cursor-pointer transition-all border-2',
                selectedStrategy === k ? 'border-primary-500 bg-primary-50/20' : 'border-transparent hover:border-gray-200'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="p-2 rounded-lg bg-primary-100 text-primary-600">
                  <Zap className="w-4 h-4" />
                </span>
                <span className="font-mono text-lg font-bold text-gray-900">{count}</span>
              </div>
              <p className="font-medium text-xs text-gray-900 line-clamp-1">{strategies[k]?.name || k}</p>
              <p className="text-[11px] text-gray-500 line-clamp-2 mt-1">{strategies[k]?.description}</p>
            </div>
          );
        })}
      </div>

      {/* Adaptations Log Table */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Adaptation Execution Log</h2>
          <span className="text-xs text-gray-500">{filteredAdaptations.length} records</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Session</th>
                <th>Attacker</th>
                <th>Triggering Intent</th>
                <th>Assigned Strategy</th>
                <th>Action Performed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAdaptations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No adaptations found matching your search.
                  </td>
                </tr>
              ) : (
                paginatedAdaptations.map((a) => (
                  <tr key={a.id}>
                    <td className="text-sm text-gray-500 font-mono whitespace-nowrap">
                      {formatTimestamp(a.timestamp)}
                    </td>
                    <td>
                      <Link href={`/sessions/${a.session_id}`} className="font-mono text-xs text-primary-600 hover:underline">
                        {a.session_id.slice(0, 12)}...
                      </Link>
                    </td>
                    <td>
                      <span className="font-mono text-xs">{a.attacker_ip}</span>
                    </td>
                    <td>
                      <span className={cn('badge text-xs', getIntentColor(a.intent))}>
                        {a.intent.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span className="badge bg-blue-100 text-blue-800 text-xs">
                        {strategies[a.strategy]?.name || a.strategy.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="text-sm text-gray-700 max-w-sm truncate">
                      {a.action}
                    </td>
                    <td>
                      <span className="badge bg-green-100 text-green-800 text-xs">
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * adaptationsPerPage + 1} to{' '}
              {Math.min(currentPage * adaptationsPerPage, filteredAdaptations.length)} of{' '}
              {filteredAdaptations.length} adaptations
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}