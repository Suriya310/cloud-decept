'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Shield,
  Clock,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { cn, formatTimestamp } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { normalizeIntent } from '@/lib/intents';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function GlobalCommandsPage() {
  const { globalCommands, globalCommandsLoading, fetchGlobalCommands, timeWindowHours } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIntent, setSelectedIntent] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'success' | 'failed'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const itemsPerPage = 50;

  useEffect(() => {
    fetchGlobalCommands({ hours: timeWindowHours, limit: 300 });
  }, [fetchGlobalCommands, timeWindowHours]);

  const copyToClipboard = useCallback(async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const toggleCommand = (cmdId: string) => {
    setExpandedCommands((prev) => {
      const next = new Set(prev);
      if (next.has(cmdId)) next.delete(cmdId);
      else next.add(cmdId);
      return next;
    });
  };

  const filteredCommands = useMemo(() => {
    const list = globalCommands || [];
    return list.filter((cmd) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        cmd.command.toLowerCase().includes(q) ||
        (cmd.output?.toLowerCase() ?? '').includes(q) ||
        cmd.session_id.toLowerCase().includes(q) ||
        (cmd.intent?.toLowerCase() ?? '').includes(q);

      const matchesIntent = selectedIntent === 'all' || cmd.intent === selectedIntent;
      const isSuccess = cmd.exit_code === 0 || cmd.success;
      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'success' && isSuccess) ||
        (selectedStatus === 'failed' && !isSuccess);

      return matchesSearch && matchesIntent && matchesStatus;
    });
  }, [globalCommands, searchQuery, selectedIntent, selectedStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredCommands.length / itemsPerPage));
  const paginatedCommands = useMemo(() => {
    return filteredCommands.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredCommands, currentPage, itemsPerPage]);

  const exportToCSV = () => {
    if (filteredCommands.length === 0) return;
    const headers = ['Timestamp', 'Session ID', 'Command', 'Exit Code', 'Duration MS', 'Intent', 'MITRE Techniques', 'Output'];
    const rows = filteredCommands.map((c) => [
      c.timestamp ?? '',
      c.session_id ?? '',
      c.command ?? '',
      c.exit_code ?? 0,
      c.duration_ms ?? 0,
      normalizeIntent(c.intent).label,
      (c.mitre_techniques || []).join('; '),
      (c.output ?? '').replace(/\n/g, ' ').replace(/"/g, '""'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clouddecept-commands-forensics-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 font-mono pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-cyan-500/15">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-white uppercase flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <span>GLOBAL COMMAND FORENSICS EXPLORER</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Analyzing executed shell commands across all honeypot sessions in the selected time window ({timeWindowHours >= 87600 ? 'All-Time' : `Last ${timeWindowHours}h`})
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchGlobalCommands({ hours: timeWindowHours, limit: 300 })}
            className="p-2 rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 hover:text-cyan-300"
            title="Refresh commands"
          >
            <RefreshCw className={cn('w-4 h-4', globalCommandsLoading && 'animate-spin text-cyan-400')} />
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

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#070e22] p-3.5 rounded-xl border border-cyan-500/20">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
          <input
            type="search"
            placeholder="Search command, output, session..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#040816] border border-cyan-500/25 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Intent filter */}
        <select
          value={selectedIntent}
          onChange={(e) => {
            setSelectedIntent(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-1.5 rounded-lg bg-[#040816] border border-cyan-500/25 text-xs text-cyan-300 focus:outline-none focus:border-cyan-400"
        >
          <option value="all">All Adversary Intents</option>
          <option value="credential_hunting">Credential Hunting</option>
          <option value="system_discovery">System Discovery</option>
          <option value="persistence">Persistence</option>
          <option value="privilege_escalation">Privilege Escalation</option>
          <option value="lateral_movement">Lateral Movement</option>
          <option value="defense_evasion">Defense Evasion</option>
          <option value="data_exfiltration">Data Exfiltration</option>
          <option value="reconnaissance">Reconnaissance</option>
          <option value="unknown">Unknown / No Pattern</option>
        </select>

        {/* Status filter */}
        <select
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value as any);
            setCurrentPage(1);
          }}
          className="px-3 py-1.5 rounded-lg bg-[#040816] border border-cyan-500/25 text-xs text-cyan-300 focus:outline-none focus:border-cyan-400"
        >
          <option value="all">All Execution Results</option>
          <option value="success">Exit Code 0 (Success)</option>
          <option value="failed">Non-Zero Exit Code (Failed)</option>
        </select>

        {/* Metrics Badge */}
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#040816] border border-cyan-500/15 text-xs text-slate-400">
          <span>MATCHED</span>
          <span className="text-cyan-300 font-bold">{filteredCommands.length} executions</span>
        </div>
      </div>

      {/* Commands List */}
      {globalCommandsLoading && filteredCommands.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-[#070e22] border border-cyan-500/15">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
          <div className="text-xs text-slate-300 uppercase font-bold">Querying Global ClickHouse Commands...</div>
        </div>
      ) : filteredCommands.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-[#070e22] border border-cyan-500/15">
          <Terminal className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white uppercase">NO COMMANDS FOUND FOR THIS CRITERIA</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Try expanding the global time window selector (e.g. 7D or All-Time) or clearing search filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedCommands.map((cmd, idx) => {
            const cmdKey = cmd.event_id || `${cmd.session_id}-${idx}`;
            const isExpanded = expandedCommands.has(cmdKey);
            const intentInfo = normalizeIntent(cmd.intent);
            const isSuccess = cmd.exit_code === 0 || cmd.success;

            return (
              <div
                key={cmdKey}
                className="rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden transition-all"
              >
                {/* Header row */}
                <div
                  onClick={() => toggleCommand(cmdKey)}
                  className="p-3.5 bg-[#040816] border-b border-cyan-500/15 flex flex-wrap items-center justify-between gap-2.5 cursor-pointer hover:bg-[#07112c]"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-bold text-xs">$</span>
                    <span className="text-xs font-bold text-white font-mono">{cmd.command}</span>
                    {cmd.arguments && cmd.arguments.length > 0 && (
                      <span className="text-xs text-slate-400 truncate max-w-xs">{cmd.arguments.join(' ')}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className="text-[10px] text-slate-400">{formatTimestamp(cmd.timestamp)}</span>

                    <Link
                      href={`/sessions/${cmd.session_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 flex items-center gap-1"
                      title="Investigate Session"
                    >
                      <span>{cmd.session_id.slice(0, 8)}</span>
                      <ExternalLink className="w-2.5 h-2.5 text-cyan-400" />
                    </Link>

                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-700 text-slate-300">
                      {intentInfo.label}
                    </span>

                    {isSuccess ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                        0 OK
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-500/30">
                        {cmd.exit_code ?? 'ERR'}
                      </span>
                    )}

                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </div>

                {/* Expanded Output */}
                {isExpanded && (
                  <div className="p-4 bg-[#02050f] space-y-2 border-t border-cyan-500/15">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase">
                      <span>COMMAND EXECUTION RECORD</span>
                      <div className="flex items-center gap-3">
                        <span>Duration: {cmd.duration_ms ?? 0} ms</span>
                        <button
                          onClick={(e) => copyToClipboard(cmd.output || '', `out-${cmdKey}`, e)}
                          className="text-cyan-400 hover:underline flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedKey === `out-${cmdKey}` ? 'Copied' : 'Copy Output'}</span>
                        </button>
                      </div>
                    </div>

                    <pre className="p-3 rounded-lg bg-[#040816] border border-cyan-500/20 text-xs font-mono text-emerald-300/90 overflow-x-auto whitespace-pre-wrap max-h-60 scrollbar-thin">
                      {cmd.output ? cmd.output : <span className="text-slate-600 italic">(Execution yielded no stdout / stderr)</span>}
                    </pre>

                    {cmd.mitre_techniques && cmd.mitre_techniques.length > 0 && (
                      <div className="pt-2 flex items-center gap-2 text-xs">
                        <span className="text-[10px] text-slate-400 uppercase">MITRE TECHNIQUES:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {cmd.mitre_techniques.map((t) => (
                            <Link
                              key={t}
                              href={`/mitre?technique=${encodeURIComponent(t)}`}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-900/40 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400"
                            >
                              {t}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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