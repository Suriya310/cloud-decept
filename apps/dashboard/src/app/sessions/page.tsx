'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  AlertTriangle,
  MapPin,
  Clock,
  Terminal,
  Copy,
  Check,
  RefreshCw,
  Shield,
  Activity,
} from 'lucide-react';
import { cn, formatTimestamp, getIntentColor } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';
import { evaluateThreat } from '@/lib/threatScore';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function SessionsPage() {
  const {
    sessions,
    fetchSessions,
    selectedSession,
    setSelectedSession,
    fetchSession,
    filters,
    setFilters,
    stats,
    sessionsLoading,
    sessionsError,
  } = useDashboardStore();

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const sessionsPerPage = 20;

  const handleCopy = useCallback(async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const loadSessions = useCallback(() => {
    fetchSessions({ status: filters.status, limit: 500, hours: 8760 });
  }, [fetchSessions, filters.status]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const sessionsArray = sessions ?? [];

  const filteredSessions = useMemo(() => {
    return sessionsArray.filter((session) => {
      const q = searchQuery.toLowerCase();
      const countryFull = getCountryName(session.src_country || session.country).toLowerCase();
      const ip = (session.src_ip ?? session.attacker_ip ?? '').toLowerCase();
      const sessId = (session.session_id ?? '').toLowerCase();
      const user = (session.username ?? '').toLowerCase();

      const matchesSearch =
        !q ||
        sessId.includes(q) ||
        ip.includes(q) ||
        countryFull.includes(q) ||
        user.includes(q);

      const matchesIntent =
        filters.intent === 'all' ||
        (session.intent_history ?? []).some((i) => i.toLowerCase() === filters.intent.toLowerCase());

      const matchesCountry =
        filters.country === 'all' ||
        session.src_country === filters.country ||
        session.country === filters.country;

      return matchesSearch && matchesIntent && matchesCountry;
    });
  }, [sessionsArray, searchQuery, filters.intent, filters.country]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / sessionsPerPage));
  const paginatedSessions = useMemo(() => {
    return filteredSessions.slice(
      (currentPage - 1) * sessionsPerPage,
      currentPage * sessionsPerPage
    );
  }, [filteredSessions, currentPage, sessionsPerPage]);

  const uniqueIntents = useMemo(() => {
    return Array.from(
      new Set(sessionsArray.flatMap((s) => s.intent_history ?? []).filter(Boolean))
    );
  }, [sessionsArray]);

  const uniqueCountries = useMemo(() => {
    return Array.from(
      new Set(
        sessionsArray
          .map((s) => s.src_country || s.country)
          .filter((c): c is string => Boolean(c))
      )
    );
  }, [sessionsArray]);

  const totalSessions = stats?.total_sessions ?? sessionsArray.length;
  const activeSessions = stats?.active_sessions ?? sessionsArray.filter((s) => s.status === 'active').length;

  const router = useRouter();

  const handleRowClick = (session: any) => {
    setSelectedSession(session);
    if (session?.session_id) {
      router.push(`/sessions/${session.session_id}`);
    }
  };

  const exportToCSV = () => {
    if (filteredSessions.length === 0) return;
    const headers = [
      'Session ID',
      'Attacker IP',
      'Country',
      'Auth Status',
      'Status',
      'Intents',
      'Commands',
      'Threat Level',
      'Duration (s)',
      'Started At',
    ];
    const rows = filteredSessions.map((s) => {
      const threat = evaluateThreat(s.threat_score ?? s.skill_level);
      return [
        s.session_id,
        s.src_ip ?? s.attacker_ip ?? '',
        getCountryName(s.src_country || s.country),
        s.auth_success === true ? 'Success' : s.auth_success === false ? 'Failed' : 'N/A',
        s.status ?? '',
        (s.intent_history ?? []).join('; '),
        s.command_count ?? 0,
        threat.label,
        s.duration_seconds ?? 0,
        s.start_time ?? '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `clouddecept-sessions-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header with Telemetry Metadata */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-cyan-500/15">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-wider text-white uppercase flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-cyan-400" />
            <span>SESSION INVESTIGATION MATRIX</span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Authoritative: <span className="text-cyan-300 font-bold">{totalSessions.toLocaleString()} total</span> sessions recorded • <span className="text-emerald-400 font-bold">{activeSessions} live</span> active probes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
            <input
              type="search"
              placeholder="Search IP, session, country..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-64 pl-9 pr-3 py-1.5 text-xs font-mono rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <select
            value={filters.status}
            onChange={(e) => {
              setFilters({ status: e.target.value });
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={filters.intent}
            onChange={(e) => {
              setFilters({ intent: e.target.value });
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Intents</option>
            {uniqueIntents.map((intent) => (
              <option key={intent} value={intent}>
                {normalizeIntent(intent).label}
              </option>
            ))}
          </select>

          <select
            value={filters.country}
            onChange={(e) => {
              setFilters({ country: e.target.value });
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Countries</option>
            {uniqueCountries.map((country) => (
              <option key={country} value={country}>
                {getCountryName(country)}
              </option>
            ))}
          </select>

          <button
            onClick={exportToCSV}
            disabled={filteredSessions.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold text-cyan-300 bg-[#070e22] border border-cyan-500/30 rounded-lg hover:border-cyan-400 hover:text-white transition-all disabled:opacity-50"
            title="Export filtered records as CSV"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            CSV
          </button>

          <button
            onClick={loadSessions}
            disabled={sessionsLoading}
            className="p-1.5 rounded-lg bg-[#070e22] border border-cyan-500/30 text-slate-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
            title="Refresh sessions list"
          >
            <RefreshCw className={cn('w-4 h-4', sessionsLoading && 'animate-spin text-cyan-400')} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {sessionsError && (
        <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-center gap-3 text-rose-300 text-xs font-mono">
          <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <div>
            <p className="font-bold uppercase tracking-wider">FAILED TO RETRIEVE SESSIONS</p>
            <p className="text-slate-400 mt-0.5">{sessionsError}</p>
          </div>
        </div>
      )}

      {/* Main Glass Table Container */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-cyan-500/20 shadow-2xl">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Attacker IP</th>
                <th>Origin Country</th>
                <th>Auth</th>
                <th>Status</th>
                <th>Intent Classification</th>
                <th>Commands</th>
                <th>Threat Assessment</th>
                <th>Duration</th>
                <th>Started At (UTC)</th>
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {sessionsLoading && sessionsArray.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-slate-400 font-mono text-xs">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" />
                    Querying ClickHouse session indexes...
                  </td>
                </tr>
              ) : paginatedSessions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-slate-500 font-mono text-xs">
                    No honeypot sessions found matching the active filters.
                  </td>
                </tr>
              ) : (
                paginatedSessions.map((session) => {
                  const ip = session.src_ip ?? session.attacker_ip ?? 'unknown';
                  const countryFull = getCountryName(session.src_country || session.country);
                  const threat = evaluateThreat(session.threat_score ?? session.skill_level);
                  const isSelected = selectedSession?.session_id === session.session_id;

                  return (
                    <tr
                      key={session.session_id}
                      onClick={() => handleRowClick(session)}
                      className={cn(
                        'cursor-pointer font-mono text-xs transition-colors',
                        isSelected ? 'bg-cyan-950/60' : 'hover:bg-cyan-950/20'
                      )}
                    >
                      {/* Session ID */}
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-300">
                          <span title={session.session_id}>
                            {session.session_id.slice(0, 10)}...
                          </span>
                          <button
                            onClick={(e) => handleCopy(session.session_id, `sess-${session.session_id}`, e)}
                            className="text-slate-500 hover:text-cyan-300 p-0.5"
                            title="Copy session ID"
                          >
                            {copiedKey === `sess-${session.session_id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Attacker IP */}
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold text-white">
                          <span>{ip}</span>
                          <button
                            onClick={(e) => handleCopy(ip, `ip-${session.session_id}`, e)}
                            className="text-slate-500 hover:text-cyan-300 p-0.5"
                            title="Copy attacker IP"
                          >
                            {copiedKey === `ip-${session.session_id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Country */}
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-1 text-slate-300">
                          <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                          <span className="truncate max-w-[130px]" title={countryFull}>
                            {countryFull}
                          </span>
                        </div>
                      </td>

                      {/* Auth */}
                      <td>
                        <span
                          className={cn(
                            'badge text-[10px] uppercase font-mono font-bold',
                            session.auth_success === true
                              ? 'text-emerald-400 bg-emerald-950/80 border-emerald-500/40'
                              : session.auth_success === false
                              ? 'text-rose-400 bg-rose-950/80 border-rose-500/40'
                              : 'text-slate-400 bg-slate-900 border-slate-700/50'
                          )}
                        >
                          {session.auth_success === true
                            ? 'GRANTED'
                            : session.auth_success === false
                            ? 'FAILED'
                            : 'N/A'}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={cn(
                            'badge text-[10px] uppercase font-mono font-bold',
                            session.status === 'active'
                              ? 'text-emerald-400 bg-emerald-950/80 border-emerald-500/40 shadow-sm shadow-emerald-950 animate-pulse'
                              : 'text-slate-400 bg-slate-900 border-slate-700/50'
                          )}
                        >
                          {session.status ?? 'CLOSED'}
                        </span>
                      </td>

                      {/* Intents */}
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[170px]">
                          {(session.intent_history ?? []).slice(0, 2).map((intent) => {
                            const norm = normalizeIntent(intent);
                            return (
                              <span
                                key={intent}
                                className={cn('badge text-[10px] font-mono px-2', norm.badgeClass)}
                                title={norm.description}
                              >
                                {norm.label}
                              </span>
                            );
                          })}
                          {(session.intent_history ?? []).length > 2 && (
                            <span className="badge bg-slate-800 text-slate-400 text-[9px] font-mono">
                              +{(session.intent_history ?? []).length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Commands */}
                      <td>
                        <div className="flex items-center gap-1 font-mono text-xs text-white">
                          <Terminal className="w-3 h-3 text-cyan-400" />
                          <span>{(session.command_count ?? 0).toLocaleString()}</span>
                        </div>
                      </td>

                      {/* Threat Assessment */}
                      <td>
                        <span
                          className={cn(
                            'badge text-[10px] font-mono font-bold',
                            threat.badgeClass
                          )}
                          title={threat.description}
                        >
                          {threat.label}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="whitespace-nowrap text-slate-400">
                        {session.duration_seconds && session.duration_seconds > 0 ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>
                              {Math.floor(session.duration_seconds / 60)}m {session.duration_seconds % 60}s
                            </span>
                          </div>
                        ) : session.status === 'active' ? (
                          <span className="text-emerald-400 font-bold">IN PROGRESS</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Started */}
                      <td className="whitespace-nowrap text-slate-400">
                        {formatTimestamp(session.start_time)}
                      </td>

                      {/* Inspect */}
                      <td>
                        <Link
                          href={`/sessions/${session.session_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/50 border border-transparent hover:border-cyan-500/30 transition-all inline-block"
                          title="Open investigation console"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-cyan-500/15 flex items-center justify-between font-mono text-xs">
            <div className="text-slate-400">
              Displaying {(currentPage - 1) * sessionsPerPage + 1} to{' '}
              {Math.min(currentPage * sessionsPerPage, filteredSessions.length)} of{' '}
              {filteredSessions.length} sessions
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-cyan-500/20 text-slate-300 hover:text-cyan-300 bg-[#070e22] disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-cyan-400 font-bold px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-cyan-500/20 text-slate-300 hover:text-cyan-300 bg-[#070e22] disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}