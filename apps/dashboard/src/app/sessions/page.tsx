'use client';

import { cn, formatTimestamp, getIntentColor } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';

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
  } = useDashboardStore();

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const sessionsPerPage = 20;

  useEffect(() => {
    fetchSessions({ status: filters.status, limit: 100 });
  }, [fetchSessions, filters.status]);

  const filteredSessions = sessions.filter((session) => {
    const matchesSearch =
      session.session_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.src_ip.includes(searchQuery) ||
      (session.src_country?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) ||
      (session.username?.toLowerCase() ?? '').includes(searchQuery.toLowerCase());

    const matchesIntent =
      filters.intent === 'all' ||
      session.intent_history.some((i) => i.toLowerCase() === filters.intent.toLowerCase());

    const matchesCountry =
      filters.country === 'all' || session.src_country === filters.country;

    return matchesSearch && matchesIntent && matchesCountry;
  });

  const totalPages = Math.ceil(filteredSessions.length / sessionsPerPage);
  const paginatedSessions = filteredSessions.slice(
    (currentPage - 1) * sessionsPerPage,
    currentPage * sessionsPerPage
  );

  const uniqueIntents = [
    ...new Set(sessions.flatMap((s) => s.intent_history)),
  ].filter(Boolean);
  const uniqueCountries = [
    ...new Set(sessions.map((s) => s.src_country).filter(Boolean)),
  ];

  const handleRowClick = (session: any) => {
    setSelectedSession(session);
    fetchSession(session.session_id);
  };

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-gray-500 mt-1">
            {sessions.length} total sessions · {sessions.filter((s) => s.status === 'active').length} active
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filters.status}
              onChange={(e) => setFilters({ status: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={filters.intent}
              onChange={(e) => setFilters({ intent: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
            >
              <option value="all">All Intents</option>
              {uniqueIntents.map((intent) => (
                <option key={intent} value={intent}>
                  {intent.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select
              value={filters.country}
              onChange={(e) => setFilters({ country: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
            >
              <option value="all">All Countries</option>
              {uniqueCountries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Attacker</th>
                <th>Auth</th>
                <th>Status</th>
                <th>Intents</th>
                <th>Commands</th>
                <th>Threat Score</th>
                <th>Duration</th>
                <th>Started</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSessions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                    No sessions found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                paginatedSessions.map((session) => (
                  <tr
                    key={session.session_id}
                    onClick={() => handleRowClick(session)}
                    className={cn(
                      'cursor-pointer transition-colors',
                      selectedSession?.session_id === session.session_id
                        ? 'bg-primary-50'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <td className="font-mono text-xs">
                      {session.session_id.slice(0, 16)}...
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        <span>{session.src_ip}</span>
                        {session.src_country && (
                          <span className="text-xs text-gray-500">({session.src_country})</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={cn(
                          'badge',
                          session.auth_success
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        )}
                      >
                        {session.auth_success ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={cn(
                          'badge',
                          session.status === 'active'
                            ? 'bg-green-100 text-green-800 animate-pulse'
                            : 'bg-gray-100 text-gray-800'
                        )}
                      >
                        {session.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {session.intent_history.slice(0, 3).map((intent) => (
                          <span
                            key={intent}
                            className={cn('badge text-xs', getIntentColor(intent))}
                          >
                            {intent.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {session.intent_history.length > 3 && (
                          <span className="badge bg-gray-100 text-gray-600 text-xs">
                            +{session.intent_history.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <Terminal className="w-3 h-3 inline text-gray-400" />
                      {session.command_count}
                    </td>
                    <td>
                      <span
                        className={cn(
                          'badge font-mono',
                          session.threat_score >= 70 ? 'bg-red-100 text-red-800' :
                          session.threat_score >= 40 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        )}
                      >
                        {session.threat_score}/100
                      </span>
                    </td>
                    <td>
                      {session.duration_seconds ? (
                        <>
                          <Clock className="w-3 h-3 inline text-gray-400" />
                          {Math.floor(session.duration_seconds / 60)}m {session.duration_seconds % 60}s
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-sm text-gray-500">
                      {formatTimestamp(session.start_time)}
                    </td>
                    <td>
                      <Link
                        href={`/sessions/${session.session_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        aria-label="View session details"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
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
              Showing {(currentPage - 1) * sessionsPerPage + 1} to{' '}
              {Math.min(currentPage * sessionsPerPage, filteredSessions.length)} of{' '}
              {filteredSessions.length} sessions
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