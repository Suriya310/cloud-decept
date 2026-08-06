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
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function CommandsPage() {
  const { sessions, fetchSessions, commands, fetchSessionCommands } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());
  const commandsPerPage = 50;

  useEffect(() => {
    fetchSessions({ limit: 200 });
  }, [fetchSessions]);

  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionCommands(selectedSessionId);
    }
  }, [selectedSessionId, fetchSessionCommands]);

  const sessionOptions = sessions.filter((s) => s.command_count > 0);

  const filteredCommands = commands.filter((cmd) => {
    const matchesSearch =
      cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cmd.output?.toLowerCase() ?? '').includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const totalPages = Math.ceil(filteredCommands.length / commandsPerPage);
  const paginatedCommands = filteredCommands.slice(
    (currentPage - 1) * commandsPerPage,
    currentPage * commandsPerPage
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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

  return (
    <div className="lg:ml-64 pt-16 min-h-screen bg-gray-50">
      <main className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Commands</h1>
            <p className="text-gray-500 mt-1">
              {commands.length} commands across {sessionOptions.length} sessions
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <select
              value={selectedSessionId || 'all'}
              onChange={(e) => setSelectedSessionId(e.target.value === 'all' ? null : e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white min-w-[200px]"
            >
              <option value="all">All Sessions</option>
              {sessionOptions.map((session) => (
                <option key={session.session_id} value={session.session_id}>
                  {session.session_id.slice(0, 12)}... ({session.command_count} cmds)
                </option>
              ))}
            </select>
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
                      No commands found. Try adjusting your filters.
                    </td>
                  </tr>
                ) : (
                  paginatedCommands.map((cmd) => (
                    <tr key={cmd.id} className={cn(expandedCommands.has(cmd.id) && 'bg-gray-50')}>
                      <td className="text-sm text-gray-500 font-mono">
                        {formatTimestamp(cmd.timestamp)}
                      </td>
                      <td>
                        <span className="font-mono text-xs text-gray-600">
                          {cmd.session_id.slice(0, 10)}...
                        </span>
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
                            cmd.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          )}
                        >
                          {cmd.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td>
                        {cmd.intent ? (
                          <span className={cn('badge text-xs', getIntentColor(cmd.intent))}>
                            {cmd.intent.replace(/_/g, ' ')}
                            {cmd.intent_confidence && (
                              <span className="ml-1 opacity-75">
                                ({Math.round(cmd.intent_confidence * 100)}%)
                              </span>
                            )}
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
                            onClick={() => toggleCommand(cmd.id)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            aria-label={expandedCommands.has(cmd.id) ? 'Collapse' : 'Expand'}
                          >
                            {expandedCommands.has(cmd.id) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(cmd.command)}
                            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                            aria-label="Copy command"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {expandedCommands.size > 0 && (
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Expanded Commands</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {Array.from(expandedCommands)
                  .map((id) => commands.find((c) => c.id === id))
                  .filter(Boolean)
                  .map((cmd) => (
                    <div key={cmd!.id} className="border border-gray-200 rounded-lg bg-white p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-900">
                          {cmd!.command}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'badge text-xs',
                              cmd!.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            )}
                          >
                            {cmd!.success ? 'Success' : 'Failed'}
                          </span>
                          {cmd!.intent && (
                            <span className={cn('badge text-xs', getIntentColor(cmd!.intent))}>
                              {cmd!.intent.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Command</p>
                          <div className="bg-gray-900 text-green-300 p-2 rounded text-xs font-mono overflow-x-auto">
                            {cmd!.command}
                          </div>
                        </div>
                        {cmd!.output && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Output</p>
                            <div className="bg-gray-900 text-gray-300 p-2 rounded text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                              {cmd!.output}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

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
    </div>
  );
}