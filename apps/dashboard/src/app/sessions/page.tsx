'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
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

  const handleRowClick = (session: any) => {
    setSelectedSession(session);
    fetchSession(session.session_id);
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
    <main className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live & Historical Sessions</h1>
          <p className="text-gray-500 mt-1">
            {totalSessions.toLocaleString()} total sessions (authoritative all-time) · {activeSessions} currently active
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search IP, Session ID, Country..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-72 pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filters.status}
              onChange={(e) => {
                setFilters({ status: e.target.value });
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Export filtered sessions to CSV"
            >
              <Download className="w-4 h-4 text-gray-500" />
              Export CSV
            </button>
            <button
              onClick={loadSessions}
              disabled={sessionsLoading}
              className="p-2 border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Refresh sessions"
            >
              <RefreshCw className={cn('w-4 h-4', sessionsLoading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {sessionsError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">Failed to load sessions</p>
            <p className="text-sm text-red-700">{sessionsError}</p>
          </div>
        </div>
      )}

      {/* Sessions Table Card */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Attacker IP</th>
                <th>Country</th>
                <th>Auth</th>
                <th>Status</th>
                <th>Intents</th>
                <th>Commands</th>
                <th>Threat Assessment</th>
                <th>Duration</th>
                <th>Started</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessionsLoading && sessionsArray.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary-500 mb-2" />
                    Loading honeypot sessions...
                  </td>
                </tr>
              ) : paginatedSessions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                    No sessions match the selected search criteria or filters.
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
                        'cursor-pointer transition-colors',
                        isSelected ? 'bg-primary-50/70' : 'hover:bg-gray-50'
                      )}
                    >
                      {/* Session ID */}
                      <td className="font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <span title={session.session_id}>
                            {session.session_id.slice(0, 12)}...
                          </span>
                          <button
                            onClick={(e) => handleCopy(session.session_id, `sess-${session.session_id}`, e)}
                            className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors"
                            title="Copy session ID"
                          >
                            {copiedKey === `sess-${session.session_id}` ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Attacker IP */}
                      <td>
                        <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-gray-800">
                          <span>{ip}</span>
                          <button
                            onClick={(e) => handleCopy(ip, `ip-${session.session_id}`, e)}
                            className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors"
                            title="Copy attacker IP"
                          >
                            {copiedKey === `ip-${session.session_id}` ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Country */}
                      <td>
                        <div className="flex items-center gap-1 text-xs text-gray-700">
                          <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="truncate max-w-[120px]" title={countryFull}>
                            {countryFull}
                          </span>
                        </div>
                      </td>

                      {/* Auth */}
                      <td>
                        <span
                          className={cn(
                            'badge text-xs',
                            session.auth_success === true
                              ? 'bg-green-100 text-green-800'
                              : session.auth_success === false
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-600'
                          )}
                        >
                          {session.auth_success === true
                            ? 'Success'
                            : session.auth_success === false
                            ? 'Failed'
                            : 'N/A'}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={cn(
                            'badge text-xs',
                            session.status === 'active'
                              ? 'bg-green-100 text-green-800 animate-pulse'
                              : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {session.status ?? 'closed'}
                        </span>
                      </td>

                      {/* Intents */}
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[160px]">
                          {(session.intent_history ?? []).slice(0, 2).map((intent) => {
                            const norm = normalizeIntent(intent);
                            return (
                              <span
                                key={intent}
                                className={cn('badge text-[11px]', getIntentColor(intent))}
                                title={norm.description}
                              >
                                {norm.label}
                              </span>
                            );
                          })}
                          {(session.intent_history ?? []).length > 2 && (
                            <span className="badge bg-gray-100 text-gray-600 text-[10px]">
                              +{(session.intent_history ?? []).length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Commands */}
                      <td>
                        <div className="flex items-center gap-1 font-mono text-xs text-gray-800">
                          <Terminal className="w-3 h-3 text-gray-400" />
                          <span>{(session.command_count ?? 0).toLocaleString()}</span>
                        </div>
                      </td>

                      {/* Threat Assessment */}
                      <td>
                        <span
                          className={cn(
                            'badge text-xs font-semibold',
                            threat.badgeBg,
                            threat.badgeColor
                          )}
                          title={threat.description}
                        >
                          {threat.label}
                        </span>
                      </td>

                      {/* Duration */}
                      <td>
                        {session.duration_seconds && session.duration_seconds > 0 ? (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span>
                              {Math.floor(session.duration_seconds / 60)}m {session.duration_seconds % 60}s
                            </span>
                          </div>
                        ) : session.status === 'active' ? (
                          <span className="text-xs text-emerald-600 font-medium">In progress</span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Started */}
                      <td className="text-xs text-gray-500 whitespace-nowrap">
                        {formatTimestamp(session.start_time)}
                      </td>

                      {/* Actions */}
                      <td>
                        <Link
                          href={`/sessions/${session.session_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors inline-block"
                          aria-label="View session details"
                          title="Open session details"
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

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * sessionsPerPage + 1} to{' '}
              {Math.min(currentPage * sessionsPerPage, filteredSessions.length)} of{' '}
              {filteredSessions.length} matching sessions
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