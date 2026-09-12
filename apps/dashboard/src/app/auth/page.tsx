'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  KeyRound,
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  RefreshCw,
  Copy,
  Check,
  Shield,
  Filter,
} from 'lucide-react';
import { cn, formatTimestamp } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function AuthenticationForensicsPage() {
  const { globalAuth, globalAuthLoading, fetchGlobalAuth, timeWindowHours } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const itemsPerPage = 50;

  useEffect(() => {
    fetchGlobalAuth({ hours: timeWindowHours, limit: 300 });
  }, [fetchGlobalAuth, timeWindowHours]);

  const copyToClipboard = useCallback(async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const filteredAuth = useMemo(() => {
    const list = globalAuth || [];
    return list.filter((a) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        a.username.toLowerCase().includes(q) ||
        (a.password?.toLowerCase() ?? '').includes(q) ||
        a.session_id.toLowerCase().includes(q);

      const isSuccess = Boolean(a.success);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'success' && isSuccess) ||
        (statusFilter === 'failed' && !isSuccess);

      return matchesSearch && matchesStatus;
    });
  }, [globalAuth, searchQuery, statusFilter]);

  // Aggregate stats
  const totalProbes = filteredAuth.length;
  const successfulLogins = filteredAuth.filter((a) => a.success).length;
  const uniqueUsernames = useMemo(() => new Set(filteredAuth.map((a) => a.username)).size, [filteredAuth]);
  const uniquePasswords = useMemo(() => new Set(filteredAuth.map((a) => a.password)).size, [filteredAuth]);

  // Top Targeted Usernames
  const topUsernames = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAuth.forEach((a) => {
      counts[a.username] = (counts[a.username] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [filteredAuth]);

  // Top Targeted Passwords
  const topPasswords = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAuth.forEach((a) => {
      if (a.password) {
        counts[a.password] = (counts[a.password] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [filteredAuth]);

  const totalPages = Math.max(1, Math.ceil(filteredAuth.length / itemsPerPage));
  const paginatedAuth = useMemo(() => {
    return filteredAuth.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredAuth, currentPage, itemsPerPage]);

  const exportToCSV = () => {
    if (filteredAuth.length === 0) return;
    const headers = ['Timestamp', 'Session ID', 'Username', 'Password', 'Result', 'Auth Method'];
    const rows = filteredAuth.map((a) => [
      a.timestamp ?? '',
      a.session_id ?? '',
      a.username ?? '',
      (a.password ?? '').replace(/"/g, '""'),
      a.success ? 'SUCCESS' : 'FAILED',
      a.auth_method ?? 'password',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clouddecept-auth-forensics-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 font-mono pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-cyan-500/15">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-white uppercase flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-cyan-400" />
            <span>AUTHENTICATION & CREDENTIAL FORENSICS</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Analyzing credential spraying, brute force attempts, and successful authentications ({timeWindowHours >= 87600 ? 'All-Time' : `Last ${timeWindowHours}h`})
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchGlobalAuth({ hours: timeWindowHours, limit: 300 })}
            className="p-2 rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 hover:text-cyan-300"
            title="Refresh authentication events"
          >
            <RefreshCw className={cn('w-4 h-4', globalAuthLoading && 'animate-spin text-cyan-400')} />
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#070e22] border border-cyan-500/25 text-xs text-cyan-300 hover:border-cyan-400"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT CSV</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase">AUTH PROBES LOGGED</span>
          <div className="text-2xl font-bold text-white mt-1">{totalProbes}</div>
          <span className="text-[10px] text-cyan-400">Total Probing Events</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase">SUCCESSFUL LOGINS</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{successfulLogins}</div>
          <span className="text-[10px] text-emerald-500/80">
            {totalProbes > 0 ? `${((successfulLogins / totalProbes) * 100).toFixed(1)}% success rate` : '0%'}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase">UNIQUE USERNAMES</span>
          <div className="text-2xl font-bold text-cyan-300 mt-1">{uniqueUsernames}</div>
          <span className="text-[10px] text-slate-400">Targeted Identifiers</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase">UNIQUE PASSWORDS</span>
          <div className="text-2xl font-bold text-amber-300 mt-1">{uniquePasswords}</div>
          <span className="text-[10px] text-slate-400">Sprayed Dictionaries</span>
        </div>
      </div>

      {/* Top Dictionaries Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Usernames */}
        <div className="p-4 rounded-xl bg-[#070e22] border border-cyan-500/20 space-y-3">
          <h3 className="text-xs font-bold text-white uppercase flex items-center justify-between">
            <span>MOST SPRAYED USERNAMES</span>
            <span className="text-[10px] text-cyan-400 font-normal">Top Probed Accounts</span>
          </h3>
          <div className="space-y-2">
            {topUsernames.length === 0 ? (
              <div className="text-xs text-slate-500 py-3">No username data available.</div>
            ) : (
              topUsernames.map(([uname, count]) => (
                <div key={uname} className="flex items-center justify-between text-xs p-2 rounded bg-[#040816] border border-cyan-500/10">
                  <span className="font-bold text-cyan-300">{uname}</span>
                  <span className="text-slate-400">{count} attempts</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Passwords */}
        <div className="p-4 rounded-xl bg-[#070e22] border border-cyan-500/20 space-y-3">
          <h3 className="text-xs font-bold text-white uppercase flex items-center justify-between">
            <span>MOST SPRAYED PASSWORDS</span>
            <span className="text-[10px] text-amber-400 font-normal">Dictionary Probes</span>
          </h3>
          <div className="space-y-2">
            {topPasswords.length === 0 ? (
              <div className="text-xs text-slate-500 py-3">No password data available.</div>
            ) : (
              topPasswords.map(([pw, count]) => (
                <div key={pw} className="flex items-center justify-between text-xs p-2 rounded bg-[#040816] border border-cyan-500/10">
                  <span className="font-bold text-amber-300 font-mono">{pw}</span>
                  <span className="text-slate-400">{count} attempts</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#070e22] p-3 rounded-xl border border-cyan-500/20">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
          <input
            type="search"
            placeholder="Search username, password, session ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#040816] border border-cyan-500/25 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 rounded-lg bg-[#040816] border border-cyan-500/25 text-xs text-cyan-300 focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Authentication Results</option>
            <option value="success">Successful Logins Only</option>
            <option value="failed">Failed Probes Only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#040816] text-[10px] text-slate-400 uppercase border-b border-cyan-500/15">
              <tr>
                <th className="py-3 px-4">TIMESTAMP</th>
                <th className="py-3 px-4">SESSION ID</th>
                <th className="py-3 px-4">USERNAME</th>
                <th className="py-3 px-4">PASSWORD</th>
                <th className="py-3 px-4">METHOD</th>
                <th className="py-3 px-4">RESULT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/10 font-mono">
              {globalAuthLoading && filteredAuth.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto mb-2" />
                    Querying ClickHouse auth attempts...
                  </td>
                </tr>
              ) : filteredAuth.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No authentication events match this query.
                  </td>
                </tr>
              ) : (
                paginatedAuth.map((a, idx) => (
                  <tr key={a.event_id || idx} className="hover:bg-cyan-950/20">
                    <td className="py-2.5 px-4 text-slate-400">{formatTimestamp(a.timestamp)}</td>
                    <td className="py-2.5 px-4">
                      <Link
                        href={`/sessions/${a.session_id}`}
                        className="text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                      >
                        <span>{a.session_id.slice(0, 8)}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-white">{a.username}</td>
                    <td className="py-2.5 px-4 text-slate-300">
                      {a.password ? (
                        <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {a.password}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">(none / key)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{a.auth_method || 'password'}</td>
                    <td className="py-2.5 px-4">
                      {a.success ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          SUCCESS
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3 text-rose-400" />
                          FAILED
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-cyan-500/15 text-xs text-slate-400">
          <span>Page {currentPage} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
