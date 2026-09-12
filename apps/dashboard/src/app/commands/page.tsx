'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { cn, formatTimestamp, getIntentColor } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { normalizeIntent } from '@/lib/intents';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function CommandsPage() {
  const { sessions, fetchSessions, commands, fetchSessionCommands } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const commandsPerPage = 50;

  const timeWindowHours = useDashboardStore((s) => s.timeWindowHours);

  useEffect(() => {
    fetchSessions({ limit: 200, hours: timeWindowHours });
  }, [fetchSessions, timeWindowHours]);

  const sessionsArray = sessions ?? [];
  const sessionOptions = useMemo(() => {
    return sessionsArray.filter((s) => (s.command_count ?? 0) > 0);
  }, [sessionsArray]);

  useEffect(() => {
    if (!selectedSessionId && sessionOptions.length > 0) {
      setSelectedSessionId(sessionOptions[0].session_id);
    }
  }, [sessionOptions, selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionCommands(selectedSessionId);
    }
  }, [selectedSessionId, fetchSessionCommands]);

  const commandsArray = commands ?? [];

  const filteredCommands = useMemo(() => {
    return commandsArray.filter((cmd) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        cmd.command.toLowerCase().includes(q) ||
        (cmd.output?.toLowerCase() ?? '').includes(q) ||
        (cmd.intent?.toLowerCase() ?? '').includes(q);
      return matchesSearch;
    });
  }, [commandsArray, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredCommands.length / commandsPerPage));
  const paginatedCommands = useMemo(() => {
    return filteredCommands.slice(
      (currentPage - 1) * commandsPerPage,
      currentPage * commandsPerPage
    );
  }, [filteredCommands, currentPage, commandsPerPage]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const toggleCommand = (cmdId: string) => {
    setExpandedCommands((prev) => {
      const next = new Set(prev);
      if (next.has(cmdId)) {
        next.delete(cmdId);
      } else {
        next.add(cmdId);
      }
      return next;
    });
  };

  const exportToCSV = () => {
    if (filteredCommands.length === 0) return;
    const headers = ['Time', 'Session ID', 'Command', 'Status', 'Intent', 'Output'];
    const rows = filteredCommands.map((c) => [
      c.timestamp ?? '',
      c.session_id ?? '',
      c.command ?? '',
      c.success || c.exit_code === 0 ? 'Success' : 'Failed',
      normalizeIntent(c.intent).label,
      (c.output ?? '').replace(/\n/g, ' '),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `clouddecept-commands-${selectedSessionId?.slice(0, 8) || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-cyan-500/15">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-white uppercase flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <span>CAPTURED COMMAND INTELLIGENCE</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Analyzing <span className="text-cyan-300 font-bold">{commandsArray.length} executions</span> in session • <span className="text-emerald-400 font-bold">{sessionOptions.length} sessions</span> with captured activity
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
            <input
              type="search"
              placeholder="Search command or output..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-64 pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <select
            value={selectedSessionId || ''}
            onChange={(e) => {
              setSelectedSessionId(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 focus:outline-none focus:border-cyan-400 max-w-[280px]"
          >
            {sessionOptions.length === 0 && <option value="">No sessions with commands</option>}
            {sessionOptions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {session.session_id.slice(0, 10)}... ({session.command_count} cmds) - {session.src_ip || session.attacker_ip}
              </option>
            ))}
          </select>

          <button
            onClick={exportToCSV}
            disabled={filteredCommands.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-cyan-300 bg-[#070e22] border border-cyan-500/30 rounded-lg hover:border-cyan-400 hover:text-white transition-all disabled:opacity-50"
            title="Export commands as CSV"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            CSV
          </button>
        </div>
      </div>

      {/* Main Glass Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-cyan-500/20 shadow-2xl">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Session</th>
                <th>Adversary Command String</th>
                <th>Status</th>
                <th>Intent</th>
                <th>Output Preview</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCommands.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-slate-500 text-xs">
                    No commands captured for this session. Select another session above.
                  </td>
                </tr>
              ) : (
                paginatedCommands.map((cmd, index) => {
                  const cmdKey = cmd.event_id || cmd.id || `cmd-${index}`;
                  const isExpanded = expandedCommands.has(cmdKey);
                  const normIntent = normalizeIntent(cmd.intent);

                  return (
                    <tr key={cmdKey} className={cn('text-xs', isExpanded && 'bg-cyan-950/40')}>
                      <td className="text-slate-400 whitespace-nowrap">
                        {formatTimestamp(cmd.timestamp)}
                      </td>
                      <td>
                        <Link
                          href={`/sessions/${cmd.session_id}`}
                          className="font-bold text-cyan-400 hover:underline"
                        >
                          {cmd.session_id.slice(0, 10)}...
                        </Link>
                      </td>
                      <td className="max-w-xs">
                        <code className="text-xs font-bold text-emerald-400 truncate block">
                          {cmd.command}
                        </code>
                      </td>
                      <td>
                        <span
                          className={cn(
                            'badge text-[10px] uppercase font-bold',
                            cmd.success || cmd.exit_code === 0
                              ? 'text-emerald-400 bg-emerald-950/80 border-emerald-500/40'
                              : 'text-rose-400 bg-rose-950/80 border-rose-500/40'
                          )}
                        >
                          {cmd.success || cmd.exit_code === 0 ? 'SUCCESS' : 'FAILED'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={cn('badge text-[10px] px-2', normIntent.badgeClass)}
                          title={normIntent.description}
                        >
                          {normIntent.label}
                        </span>
                      </td>
                      <td className="max-w-md">
                        {cmd.output ? (
                          <code className="text-slate-400 truncate block text-[11px]">
                            {cmd.output.slice(0, 75)}
                            {cmd.output.length > 75 ? '...' : ''}
                          </code>
                        ) : (
                          <span className="text-slate-600">No output</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleCommand(cmdKey)}
                            className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(cmd.command, cmdKey)}
                            className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                            aria-label="Copy command"
                            title="Copy command string"
                          >
                            {copiedKey === cmdKey ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-cyan-500/15 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing {(currentPage - 1) * commandsPerPage + 1} to{' '}
              {Math.min(currentPage * commandsPerPage, filteredCommands.length)} of{' '}
              {filteredCommands.length} commands
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