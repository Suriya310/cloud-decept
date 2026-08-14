'use client';

import { cn, formatTimestamp, getIntentColor } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Shield,
  Zap,
  Eye,
  Copy,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';

const adaptationStrategies = [
  'credential_capture',
  'fake_environment',
  'throttle',
  'decoy_resource',
  'session_terminate',
  'alert_only',
];

export default function AdaptationsPage() {
  const { sessions, fetchSessions } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const adaptationsPerPage = 20;

  useEffect(() => {
    fetchSessions({ limit: 200 });
  }, [fetchSessions]);

  const sessionsArray = sessions ?? [];

  const mockAdaptations = sessionsArray.flatMap((session) =>
    (session.intent_history ?? []).map((intent, idx) => ({
      id: `adapt-${session.session_id}-${idx}`,
      session_id: session.session_id,
      timestamp: new Date(new Date(session.start_time).getTime() + idx * 30000).toISOString(),
      intent,
      strategy: adaptationStrategies[Math.floor(Math.random() * adaptationStrategies.length)],
      action: getMockAction(intent),
      success: Math.random() > 0.1,
      details: { fake_credentials_generated: Math.random() > 0.5, resources_created: Math.floor(Math.random() * 5) },
    }))
  );

  function getMockAction(intent: string): string {
    switch (intent) {
      case 'credential_access':
        return 'Generated fake AWS credentials and SSH keys';
      case 'discovery':
        return 'Returned fake cloud resource listings';
      case 'lateral_movement':
        return 'Created decoy internal network targets';
      case 'persistence':
        return 'Deployed fake scheduled tasks and services';
      case 'data_exfiltration':
        return 'Served fake data archives';
      case 'resource_hijacking':
        return 'Spawned decoy mining processes';
      case 'defense_evasion':
        return 'Returned fake clean system logs';
      default:
        return 'Applied generic deception';
    }
  }

  const filteredAdaptations = mockAdaptations.filter((adapt) => {
    const matchesSearch =
      adapt.session_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      adapt.intent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      adapt.strategy.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStrategy = selectedStrategy === 'all' || adapt.strategy === selectedStrategy;

    return matchesSearch && matchesStrategy;
  });

  const totalPages = Math.ceil(filteredAdaptations.length / adaptationsPerPage);
  const paginatedAdaptations = filteredAdaptations.slice(
    (currentPage - 1) * adaptationsPerPage,
    currentPage * adaptationsPerPage
  );

  const strategyCounts = mockAdaptations.reduce((acc, a) => {
    acc[a.strategy] = (acc[a.strategy] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const successRate =
    mockAdaptations.length > 0
      ? Math.round((mockAdaptations.filter((a) => a.success).length / mockAdaptations.length) * 100)
      : 0;

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Adaptations</h1>
            <p className="text-gray-500 mt-1">
              {mockAdaptations.length} adaptations applied · {successRate}% success rate
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search adaptations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white min-w-[200px]"
            >
              <option value="all">All Strategies</option>
              {adaptationStrategies.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy.replace(/_/g, ' ')} ({strategyCounts[strategy] || 0})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {adaptationStrategies.map((strategy) => (
            <div key={strategy} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <Zap className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {strategy.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-gray-500">{strategyCounts[strategy] || 0} uses</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Session</th>
                  <th>Intent</th>
                  <th>Strategy</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAdaptations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      No adaptations found. Try adjusting your filters.
                    </td>
                  </tr>
                ) : (
                  paginatedAdaptations.map((adapt) => (
                    <tr key={adapt.id} className="hover:bg-gray-50">
                      <td className="text-sm text-gray-500 font-mono">
                        {formatTimestamp(adapt.timestamp)}
                      </td>
                      <td>
                        <span className="font-mono text-xs text-gray-600">
                          {adapt.session_id.slice(0, 10)}...
                        </span>
                      </td>
                      <td>
                        <span className={cn('badge text-xs', getIntentColor(adapt.intent))}>
                          {adapt.intent.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className="badge bg-blue-100 text-blue-800 text-xs">
                          {adapt.strategy.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="max-w-md text-sm text-gray-600">
                        {adapt.action}
                      </td>
                      <td>
                        <span
                          className={cn(
                            'badge',
                            adapt.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          )}
                        >
                          {adapt.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td className="text-sm text-gray-500">
                        {adapt.details.fake_credentials_generated ? '🔑 Creds ' : ''}
                        {adapt.details.resources_created > 0 ? `${adapt.details.resources_created} resources` : 'No resources'}
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

        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Adaptation Strategies Overview</h2>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                name: 'Credential Capture',
                desc: 'Generate fake credentials (AWS keys, SSH keys, API tokens) when attackers attempt credential access',
                icon: '🔑',
                color: 'bg-red-100 text-red-600',
              },
              {
                name: 'Fake Environment',
                desc: 'Return simulated cloud resource listings (VMs, storage, databases) for discovery commands',
                icon: '☁️',
                color: 'bg-blue-100 text-blue-600',
              },
              {
                name: 'Throttle',
                desc: 'Add artificial delays to slow down automated attacks and brute force attempts',
                icon: '⏱️',
                color: 'bg-yellow-100 text-yellow-600',
              },
              {
                name: 'Decoy Resources',
                desc: 'Create convincing fake resources (S3 buckets, VMs, databases) to waste attacker time',
                icon: '🎯',
                color: 'bg-purple-100 text-purple-600',
              },
              {
                name: 'Session Terminate',
                desc: 'Gracefully terminate sessions when high-risk activities are detected',
                icon: '🛑',
                color: 'bg-orange-100 text-orange-600',
              },
              {
                name: 'Alert Only',
                desc: 'Log and alert on suspicious activity without active intervention (monitoring mode)',
                icon: '📢',
                color: 'bg-gray-100 text-gray-600',
              },
            ].map((strategy) => (
              <div key={strategy.name} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="text-3xl">{strategy.icon}</div>
                  <div>
                    <h3 className="font-medium text-gray-900">{strategy.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{strategy.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
  );
}