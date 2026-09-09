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
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Link from 'next/link';

export default function CommandsPage() {
  const { sessions, fetchSessions, commands, fetchSessionCommands } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const commandsPerPage = 50;

  useEffect(() => {
    fetchSessions({ limit: 200, hours: 8760 });
  }, [fetchSessions]);

  const sessionsArray = sessions ?? [];
  const sessionOptions = sessionsArray.filter((s) => (s.command_count ?? 0) > 0);

  // Auto-select first session with commands if none selected
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

  const filteredCommands = commandsArray.filter((cmd) => {
    const matchesSearch =
      cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cmd.output?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) ||
      (cmd.intent?.toLowerCase() ?? '').includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const totalPages = Math.ceil(filteredCommands.length / commandsPerPage);
  const paginatedCommands = filteredCommands.slice(
    (currentPage - 1) * commandsPerPage,
    currentPage * commandsPerPage
  );

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

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
    const rows = filteredCommands.map(c => [
      c.timestamp ?? '',
      c.session_id ?? '',
      c.command ?? '',
      c.success || c.exit_code === 0 ? 'Success' : 'Failed',
      c.intent ?? '',
      (c.output ?? '').replace(/\n/g, ' '),
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
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
    <main className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Captured Commands</h1>
          <p className="text-gray-500 mt-1">
            {commandsArray.length} commands for current session ({sessionOptions.length} active command sessions)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search command or output..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={selectedSessionId || ''}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white max-w-[260px]"
          >
            {sessionOptions.length === 0 && <option value="">No sessions with commands</option>}
            {sessionOptions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {session.session_id.slice(0, 12)}... ({session.command_count} cmds) - {session.src_ip || session.attacker_ip}
              </option>
            ))}
          </select>
          <button
            onClick={exportToCSV}
            disabled={filteredCommands.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Export commands to CSV"
          >
            <Download className="w-4 h-4 text-gray-500" />
            Export
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Session</th>
                <th>Command</th>
                <th>Status</th>
                <th>Intent</th>
                <th>Output Preview</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCommands.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No commands found. Select another session or adjust search query.
                  </td>
                </tr>
              ) : (
                paginatedCommands.map((cmd, index) => {
                  const cmdKey = cmd.event_id || cmd.id || `cmd-${index}`;
                  const isExpanded = expandedCommands.has(cmdKey);
                  return (
                    <tr key={cmdKey} className={cn(isExpanded && 'bg-gray-50')}>
                      <td className="text-sm text-gray-500 font-mono whitespace-nowrap">
                        {formatTimestamp(cmd.timestamp)}
                      </td>
                      <td>
                        <Link href={`/sessions/${cmd.session_id}`} className="font-mono text-xs text-primary-600 hover:underline">
                          {cmd.session_id.slice(0, 10)}...
                        </Link>
                      </td>
                      <td className="max-w-xs">
                        <code className="text-sm font-mono text-gray-900 truncate block">
                          {cmd.command}
                        </code>
                      </td>
                      <td>
                        <span
                          className={cn(
                            'badge',
                            cmd.success || cmd.exit_code === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          )}
                        >
                          {cmd.success || cmd.exit_code === 0 ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td>
                        {cmd.intent ? (
                          <span className={cn('badge text-xs', getIntentColor(cmd.intent))}>
                            {cmd.intent.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="max-w-md">
                        {cmd.output ? (
                          <code className="text-xs text-gray-500 truncate block font-mono">
                            {cmd.output.slice(0, 80)}{cmd.output.length > 80 ? '...' : ''}
                          </code>
                        ) : (
                          <span className="text-gray-400 text-xs">No output</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleCommand(cmdKey)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
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
                            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                            aria-label="Copy command"
                          >
                            {copiedKey === cmdKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
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
          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * commandsPerPage + 1} to{' '}
              {Math.min(currentPage * commandsPerPage, filteredCommands.length)} of{' '}
              {filteredCommands.length} commands
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