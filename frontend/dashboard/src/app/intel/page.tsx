'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Shield,
  AlertTriangle,
  Search,
  Filter,
  Download,
  Eye,
  FileText,
  Globe,
  Network,
  Key,
  Hash,
  Terminal,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { MetricCard, ChartCard, TacticChart, ChartSkeleton } from '@/components/Charts';

const SEVERITY_COLORS = {
  critical: 'badge-danger',
  high: 'badge-warning',
  medium: 'badge-primary',
  low: 'badge-success',
};

const IOC_TYPE_ICONS: Record<string, React.ReactNode> = {
  ipv4: <Globe className="w-4 h-4" />,
  ipv6: <Globe className="w-4 h-4" />,
  aws_access_key: <Key className="w-4 h-4" />,
  aws_secret_key: <Key className="w-4 h-4" />,
  ssh_private_key: <Key className="w-4 h-4" />,
  jwt_token: <Hash className="w-4 h-4" />,
  email: <Network className="w-4 h-4" />,
  domain: <Globe className="w-4 h-4" />,
  url: <Globe className="w-4 h-4" />,
  md5: <Hash className="w-4 h-4" />,
  sha256: <Hash className="w-4 h-4" />,
  default: <Terminal className="w-4 h-4" />,
};

const mockIOCs = [
  { type: 'aws_access_key', value: 'AKIAIOSFODNN7EXAMPLE', confidence: 0.99, context: 'Found in ~/.aws/credentials', session: 'sess_002', severity: 'critical' as const },
  { type: 'aws_secret_key', value: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', confidence: 0.98, context: 'Found in ~/.aws/credentials', session: 'sess_002', severity: 'critical' as const },
  { type: 'ipv4', value: '203.0.113.45', confidence: 0.95, context: 'Attacker source IP', session: 'sess_001', severity: 'medium' as const },
  { type: 'ipv4', value: '198.51.100.23', confidence: 0.95, context: 'Attacker source IP', session: 'sess_002', severity: 'medium' as const },
  { type: 'ssh_private_key', value: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...', confidence: 0.99, context: 'Found in ~/.ssh/id_rsa', session: 'sess_003', severity: 'critical' as const },
  { type: 'jwt_token', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', confidence: 0.9, context: 'Found in environment variable', session: 'sess_004', severity: 'high' as const },
  { type: 'email', value: 'admin@company.com', confidence: 0.7, context: 'Found in git config', session: 'sess_001', severity: 'low' as const },
  { type: 'domain', value: 'malicious-c2.example.com', confidence: 0.85, context: 'Found in network connections', session: 'sess_005', severity: 'high' as const },
];

const mockTechniques = [
  { id: 'T1526', name: 'Cloud Service Discovery', tactic: 'Discovery', severity: 'low' as const, trigger: 'aws ec2 describe-instances', sessions: ['sess_001', 'sess_006'] },
  { id: 'T1530', name: 'Cloud Storage Object Discovery', tactic: 'Discovery', severity: 'low' as const, trigger: 'aws s3 ls', sessions: ['sess_001', 'sess_004'] },
  { id: 'T1082', name: 'System Information Discovery', tactic: 'Discovery', severity: 'low' as const, trigger: 'uname -a, whoami', sessions: ['sess_001', 'sess_002', 'sess_003'] },
  { id: 'T1552.001', name: 'Credentials In Files', tactic: 'Credential Access', severity: 'critical' as const, trigger: 'cat ~/.aws/credentials', sessions: ['sess_002'] },
  { id: 'T1555.003', name: 'Secrets from Vaults', tactic: 'Credential Access', severity: 'high' as const, trigger: 'aws secretsmanager get-secret-value', sessions: ['sess_002', 'sess_004'] },
  { id: 'T1078.004', name: 'Valid Accounts: Cloud Accounts', tactic: 'Initial Access', severity: 'critical' as const, trigger: 'aws sts get-caller-identity', sessions: ['sess_001', 'sess_002'] },
  { id: 'T1550.007', name: 'Cloud Token Abuse', tactic: 'Lateral Movement', severity: 'critical' as const, trigger: 'aws sts assume-role', sessions: ['sess_003'] },
  { id: 'T1021.004', name: 'Remote Services: SSH', tactic: 'Lateral Movement', severity: 'high' as const, trigger: 'ssh -i key.pem user@host', sessions: ['sess_003', 'sess_006'] },
  { id: 'T1098', name: 'Account Manipulation', tactic: 'Persistence', severity: 'high' as const, trigger: 'aws iam create-access-key', sessions: ['sess_005'] },
  { id: 'T1485', name: 'Data Destruction', tactic: 'Impact', severity: 'critical' as const, trigger: 'rm -rf /data', sessions: [] },
];

const mockSessions = [
  { id: 'sess_001', time: '2024-01-15T10:23:45Z', ip: '203.0.113.45', country: 'China', intent: 'cloud_recon', duration: 420, commands: 23, risk: 'medium' as const, summary: 'Attacker performed extensive cloud reconnaissance, enumerating EC2 instances, S3 buckets, and IAM users. No credential access detected.' },
  { id: 'sess_002', time: '2024-01-15T11:05:12Z', ip: '198.51.100.23', country: 'Russia', intent: 'credential_hunting', duration: 180, commands: 12, risk: 'critical' as const, summary: 'Attacker successfully discovered AWS credentials in ~/.aws/credentials and attempted to use them for privilege escalation via STS AssumeRole.' },
  { id: 'sess_003', time: '2024-01-15T12:30:00Z', ip: '192.0.2.67', country: 'USA', intent: 'privilege_escalation', duration: 65, commands: 8, risk: 'high' as const, summary: 'Attacker attempted to attach AdministratorAccess policy to their user account. Adaptation engine granted fake admin access after 2 failed attempts.' },
  { id: 'sess_004', time: '2024-01-15T13:45:22Z', ip: '203.0.113.89', country: 'Brazil', intent: 'data_access', duration: 890, commands: 45, risk: 'high' as const, summary: 'Attacker accessed S3 buckets and downloaded database backups. Fake sensitive data was served by adaptation engine.' },
  { id: 'sess_005', time: '2024-01-15T14:12:10Z', ip: '198.51.100.45', country: 'India', intent: 'persistence', duration: 340, commands: 18, risk: 'high' as const, summary: 'Attacker created new IAM access keys and SSH key pairs for persistent access. All actions logged and monitored.' },
  { id: 'sess_006', time: '2024-01-15T15:20:00Z', ip: '192.0.2.12', country: 'Germany', intent: 'lateral_movement', duration: 900, commands: 31, risk: 'high' as const, summary: 'Attacker used SSM to pivot to internal instances. Fake internal network topology was presented by adaptation engine.' },
];

export default function ThreatIntelPage() {
  const [iocFilter, setIocFilter] = useState('all');
  const [techniqueFilter, setTechniqueFilter] = useState('all');
  const [selectedSession, setSelectedSession] = useState<typeof mockSessions[0] | null>(null);

  const filteredIOCs = mockIOCs.filter(ioc => iocFilter === 'all' || ioc.severity === iocFilter);
  const filteredTechniques = mockTechniques.filter(t => techniqueFilter === 'all' || t.severity === techniqueFilter);

  const severityCounts = {
    critical: mockIOCs.filter(i => i.severity === 'critical').length,
    high: mockIOCs.filter(i => i.severity === 'high').length,
    medium: mockIOCs.filter(i => i.severity === 'medium').length,
    low: mockIOCs.filter(i => i.severity === 'low').length,
  };

  const tacticSummary = mockTechniques.reduce((acc, t) => {
    acc[t.tactic] = (acc[t.tactic] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <main className="lg:ml-64 p-4 lg:p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Threat Intelligence</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              MITRE ATT&CK mapping, IOC extraction, and session analysis
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export Report
            </button>
            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Generate Summary
            </button>
          </div>
        </div>

        {/* IOC Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard title="Critical IOCs" value={severityCounts.critical} change={3} trend="up" icon={<AlertTriangle className="w-6 h-6" />} color="bg-danger-500" />
          <MetricCard title="High Severity" value={severityCounts.high} change={2} trend="up" icon={<AlertTriangle className="w-6 h-6" />} color="bg-warning-500" />
          <MetricCard title="Medium Severity" value={severityCounts.medium} change={0} trend="neutral" icon={<Shield className="w-6 h-6" />} color="bg-primary-500" />
          <MetricCard title="Low Severity" value={severityCounts.low} change={0} trend="neutral" icon={<FileText className="w-6 h-6" />} color="bg-success-500" />
        </div>

        {/* MITRE ATT&CK Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard title="MITRE ATT&CK Tactics" subtitle="Detected techniques by tactic">
            <TacticChart />
          </ChartCard>

          <ChartCard title="Technique Severity Distribution" subtitle="Count by severity level">
            <div className="h-64 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl font-bold text-danger-600 mb-2">{mockTechniques.filter(t => t.severity === 'critical').length}</div>
                <div className="text-sm text-slate-500">Critical</div>
                <div className="text-2xl font-bold text-warning-600 mt-4 mb-1">{mockTechniques.filter(t => t.severity === 'high').length}</div>
                <div className="text-sm text-slate-500">High</div>
              </div>
            </div>
          </ChartCard>
        </div>

        {/* IOCs Table */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Extracted IOCs</h2>
            <div className="flex items-center gap-3">
              <select
                value={iocFilter}
                onChange={(e) => setIocFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Value</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Severity</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Confidence</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Session</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Context</th>
                </tr>
              </thead>
              <tbody>
                {filteredIOCs.map((ioc, idx) => (
                  <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        {IOC_TYPE_ICONS[ioc.type] || IOC_TYPE_ICONS.default}
                        <span className="text-sm font-medium capitalize">{ioc.type.replace(/_/g, ' ')}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-slate-700 dark:text-slate-200 max-w-xs truncate" title={ioc.value}>
                      {ioc.value.length > 50 ? ioc.value.substring(0, 50) + '...' : ioc.value}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${SEVERITY_COLORS[ioc.severity]} capitalize`}>{ioc.severity}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">
                      {(ioc.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-slate-600 dark:text-slate-300">{ioc.session}</td>
                    <td className="py-3 px-4 text-sm text-slate-500 dark:text-slate-400 max-w-md truncate" title={ioc.context}>
                      {ioc.context}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* MITRE Techniques Table */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">MITRE ATT&CK Techniques</h2>
            <div className="flex items-center gap-3">
              <select
                value={techniqueFilter}
                onChange={(e) => setTechniqueFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Technique ID</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Tactic</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Severity</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Trigger</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTechniques.map((tech, idx) => (
                  <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono text-sm font-medium text-primary-600 dark:text-primary-400">{tech.id}</td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-200">{tech.name}</td>
                    <td className="py-3 px-4">
                      <span className="badge badge-gray">{tech.tactic}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${SEVERITY_COLORS[tech.severity]} capitalize`}>{tech.severity}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate" title={tech.trigger}>
                      {tech.trigger}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">
                      {tech.sessions.length > 0 ? tech.sessions.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Session Summaries */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Session Threat Summaries</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setSelectedSession(session)}
                className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-primary-300 dark:hover:border-primary-700 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono text-sm font-medium text-slate-900 dark:text-white">{session.id}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{format(new Date(session.time), 'MMM d, HH:mm')}</p>
                  </div>
                  <span className={`badge ${SEVERITY_COLORS[session.risk]} capitalize`}>{session.risk} risk</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
                  <div><span className="text-slate-500">IP:</span> <span className="font-mono ml-1">{session.ip}</span></div>
                  <div><span className="text-slate-500">Duration:</span> <span className="font-mono ml-1">{session.duration}s</span></div>
                  <div><span className="text-slate-500">Cmds:</span> <span className="font-mono ml-1">{session.commands}</span></div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">{session.summary}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Primary intent: <span className="font-medium capitalize">{session.intent.replace('_', ' ')}</span></span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Session Detail Modal */}
        {selectedSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold">Session Analysis: {selectedSession.id}</h2>
                <button onClick={() => setSelectedSession(null)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div><p className="text-sm text-slate-500">Attacker IP</p><p className="font-mono">{selectedSession.ip}</p></div>
                  <div><p className="text-sm text-slate-500">Country</p><p>{selectedSession.country}</p></div>
                  <div><p className="text-sm text-slate-500">Duration</p><p className="font-mono">{selectedSession.duration}s</p></div>
                  <div><p className="text-sm text-slate-500">Commands</p><p className="font-mono">{selectedSession.commands}</p></div>
                  <div className="col-span-2"><p className="text-sm text-slate-500">Primary Intent</p><p className="capitalize font-medium">{selectedSession.intent.replace('_', ' ')}</p></div>
                </div>
                <div>
                  <h3 className="font-semibold mb-3">AI-Generated Summary</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                    {selectedSession.summary}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}