'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Maximize2, Minimize2, Copy, AlertTriangle, Zap, FileText, Search, Filter } from 'lucide-react';

interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'system' | 'prompt';
  content: string;
  timestamp?: string;
}

const INITIAL_LINES: TerminalLine[] = [
  { type: 'system', content: 'CloudDecept Honeypot - Live Session View', timestamp: new Date().toISOString() },
  { type: 'system', content: 'Connected to simulation environment: northbridge-healthcare (AWS)', timestamp: new Date().toISOString() },
  { type: 'system', content: 'Waiting for attacker connection on port 2222...', timestamp: new Date().toISOString() },
  { type: 'system', content: '--- Attacker connected: 203.0.113.45 (China) ---', timestamp: new Date().toISOString() },
  { type: 'prompt', content: 'ubuntu@ubuntu-server:~$ ', timestamp: new Date().toISOString() },
  { type: 'input', content: 'whoami', timestamp: new Date().toISOString() },
  { type: 'output', content: 'ubuntu', timestamp: new Date().toISOString() },
  { type: 'prompt', content: 'ubuntu@ubuntu-server:~$ ', timestamp: new Date().toISOString() },
  { type: 'input', content: 'uname -a', timestamp: new Date().toISOString() },
  { type: 'output', content: 'Linux ubuntu-server 5.15.0-1051-aws #56-Ubuntu SMP Mon Jun 17 21:40:42 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux', timestamp: new Date().toISOString() },
  { type: 'prompt', content: 'ubuntu@ubuntu-server:~$ ', timestamp: new Date().toISOString() },
  { type: 'input', content: 'aws ec2 describe-instances', timestamp: new Date().toISOString() },
  { type: 'output', content: '{\n  "Reservations": [\n    {\n      "Instances": [\n        {\n          "InstanceId": "i-0a1b2c3d4e5f6g7h8",\n          "InstanceType": "t3.medium",\n          "State": {"Name": "running"},\n          "PrivateIpAddress": "10.0.1.45",\n          "PublicIpAddress": "54.123.45.67",\n          "Tags": [{"Key": "Name", "Value": "web-server-001"}]\n        },\n        {\n          "InstanceId": "i-1b2c3d4e5f6g7h8i9",\n          "InstanceType": "m5.large",\n          "State": {"Name": "running"},\n          "PrivateIpAddress": "10.0.1.89",\n          "PublicIpAddress": "54.123.45.68",\n          "Tags": [{"Key": "Name", "Value": "api-gateway-001"}]\n        }\n      ]\n    }\n  ]\n}', timestamp: new Date().toISOString() },
  { type: 'prompt', content: 'ubuntu@ubuntu-server:~$ ', timestamp: new Date().toISOString() },
  { type: 'input', content: 'aws s3 ls', timestamp: new Date().toISOString() },
  { type: 'output', content: '2024-01-10 14:23:12 northbridge-healthcare-data-lake\n2024-01-11 09:15:44 northbridge-healthcare-logs\n2024-01-12 16:45:22 northbridge-healthcare-backups\n2024-01-13 11:30:00 northbridge-healthcare-ml-models', timestamp: new Date().toISOString() },
  { type: 'prompt', content: 'ubuntu@ubuntu-server:~$ ', timestamp: new Date().toISOString() },
];

export default function TerminalPage() {
  const [lines, setLines] = useState<TerminalLine[]>(INITIAL_LINES);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  const [sessionId] = useState('sess_live_' + Date.now());
  const [filter, setFilter] = useState<'all' | 'input' | 'output' | 'error'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);

  // Simulate live attacker activity
  useEffect(() => {
    if (!isConnected) return;

    const commands = [
      { cmd: 'aws iam list-users', delay: 3000 },
      { cmd: 'cat ~/.aws/credentials', delay: 6000 },
      { cmd: 'env | grep AWS', delay: 8000 },
      { cmd: 'aws sts assume-role --role-arn arn:aws:iam::123456789012:role/AdminRole', delay: 12000 },
      { cmd: 'aws s3 cp s3://northbridge-healthcare-backups/prod-db.sql .', delay: 15000 },
    ];

    commands.forEach(({ cmd, delay }) => {
      setTimeout(() => {
        if (!isConnected) return;
        const now = new Date().toISOString();
        setLines(prev => [
          ...prev,
          { type: 'prompt', content: 'ubuntu@ubuntu-server:~$ ', timestamp: now },
          { type: 'input', content: cmd, timestamp: now },
          { type: 'output', content: generateOutput(cmd), timestamp: now },
        ]);
      }, delay);
    });
  }, [isConnected]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const generateOutput = (cmd: string): string => {
    if (cmd.includes('iam list-users')) {
      return `{\n  "Users": [\n    {"UserName": "admin", "UserId": "AIDA12345678901234", "Arn": "arn:aws:iam::123456789012:user/admin"},\n    {"UserName": "developer", "UserId": "AIDA56789012345678", "Arn": "arn:aws:iam::123456789012:user/developer"},\n    {"UserName": "ci-cd", "UserId": "AIDA90123456789012", "Arn": "arn:aws:iam::123456789012:user/ci-cd"}\n  ]\n}`;
    }
    if (cmd.includes('cat ~/.aws/credentials')) {
      return `[default]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\naws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n\n[admin]\naws_access_key_id = AKIAFAKEKEY123456789\naws_secret_access_key = FakeSecretKey123456789012345678901234`;
    }
    if (cmd.includes('env | grep AWS')) {
      return `AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\nAWS_DEFAULT_REGION=us-east-1\nAWS_SESSION_TOKEN=IQoJb3JpZ2luX2VjE...`;
    }
    if (cmd.includes('assume-role')) {
      return `{\n  "Credentials": {\n    "AccessKeyId": "ASIAFAKEKEY123456789",\n    "SecretAccessKey": "FakeSessionSecret123456789012345678901234",\n    "SessionToken": "IQoJb3JpZ2luX2VjEFakeSessionToken...",\n    "Expiration": "2024-01-15T16:30:00Z"\n  },\n  "AssumedRoleUser": {\n    "AssumedRoleId": "AROFAKE123456789:session",\n    "Arn": "arn:aws:iam::123456789012:role/AdminRole"\n  }\n}`;
    }
    if (cmd.includes('s3 cp')) {
      return `download: s3://northbridge-healthcare-backups/prod-db.sql to ./prod-db.sql\n2048576000 of 2048576000  (100.0%)`;
    }
    return 'Command executed successfully.';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const now = new Date().toISOString();
    setLines(prev => [
      ...prev,
      { type: 'input', content: inputValue, timestamp: now },
      { type: 'output', content: generateOutput(inputValue), timestamp: now },
    ]);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const filteredLines = lines.filter(line => {
    if (filter !== 'all' && line.type !== filter) return false;
    if (searchTerm && !line.content.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <main className={`lg:ml-64 p-4 lg:p-6 ${isMaximized ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900' : ''}`}>
        {/* Header */}
        {!isMaximized && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Live Terminal</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">Real-time attacker session monitoring</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
                Live Session: {sessionId}
              </span>
              <button onClick={() => setIsMaximized(true)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Maximize">
                <Maximize2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Terminal Container */}
        <div className={`card flex flex-col ${isMaximized ? 'h-[calc(100vh-2rem)]' : 'h-[calc(100vh-20rem)]'}`}>
          {/* Terminal Toolbar */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-success-500' : 'bg-danger-500'}`} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                Attacker: 203.0.113.45 (China)
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                Intent: <span className="text-primary-600 font-medium">cloud_recon</span> (92%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter output..."
                  className="pl-8 pr-4 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-sm w-48"
                />
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-sm"
              >
                <option value="all">All</option>
                <option value="input">Input</option>
                <option value="output">Output</option>
                <option value="error">Errors</option>
              </select>
              <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Auto-scroll
              </label>
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title={isMaximized ? 'Minimize' : 'Maximize'}
              >
                {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
              {isMaximized && (
                <button onClick={() => setIsMaximized(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Exit fullscreen">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Terminal Output */}
          <div
            ref={terminalRef}
            className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-slate-950 text-green-300"
            style={{ fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace' }}
          >
            {filteredLines.map((line, index) => (
              <div key={index} className={`terminal-line ${line.type}`}>
                {line.timestamp && (
                  <span className="text-slate-500 mr-2" style={{ userSelect: 'none' }}>
                    [{new Date(line.timestamp).toLocaleTimeString()}]
                  </span>
                )}
                <span className={getLineStyle(line.type)} style={{ userSelect: 'text' }}>
                  {line.content}
                </span>
              </div>
            ))}
            {/* Input line */}
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <span className="text-green-400" style={{ userSelect: 'none' }}>ubuntu@ubuntu-server:~$ </span>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent border-none outline-none text-green-300 caret-green-400"
                style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
                autoFocus
              />
            </form>
          </div>

          {/* Status Bar */}
          <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-4">
              <span>{filteredLines.length} lines displayed</span>
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Intent: cloud_recon
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-warning-500" />
                3 adaptations applied
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-1 rounded hover:bg-slate-800" title="Clear terminal">
                <FileText className="w-4 h-4" />
              </button>
              <button className="p-1 rounded hover:bg-slate-800" title="Copy all">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Side Panel (when not maximized) */}
        {!isMaximized && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card">
              <h3 className="font-semibold mb-3">Session Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Session ID</span><span className="font-mono">{sessionId}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Attacker IP</span><span className="font-mono">203.0.113.45</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Country</span><span>China (AS4134)</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Started</span><span>{new Date().toLocaleTimeString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Duration</span><span id="duration">0s</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Commands</span><span>{lines.filter(l => l.type === 'input').length}</span></div>
              </div>
            </div>
            <div className="card">
              <h3 className="font-semibold mb-3">Intent Timeline</h3>
              <div className="space-y-2">
                <IntentBadge time="00:00" intent="cloud_recon" confidence={0.92} />
                <IntentBadge time="01:30" intent="credential_hunting" confidence={0.89} />
                <IntentBadge time="03:45" intent="privilege_escalation" confidence={0.78} />
              </div>
            </div>
            <div className="card">
              <h3 className="font-semibold mb-3">Adaptations Applied</h3>
              <div className="space-y-2 text-sm">
                <AdaptationItem time="00:45" desc="Enriched EC2 response with 5 additional instances" />
                <AdaptationItem time="02:10" desc="Planted fake AWS credentials in ~/.aws/credentials" />
                <AdaptationItem time="04:20" desc="Granted fake admin access after 2 failed attempts" />
              </div>
            </div>
          </div>
        )}

        {/* Duration timer */}
        <script dangerouslySetInnerHTML={{
          __html: `
            setInterval(() => {
              const el = document.getElementById('duration');
              if (el) {
                const start = new Date().getTime() - ${Date.now()};
                el.textContent = Math.floor(start / 1000) + 's';
              }
            }, 1000);
          `
        }} />
      </main>
    </div>
  );
}

function getLineStyle(type: TerminalLine['type']) {
  switch (type) {
    case 'input': return 'text-yellow-300';
    case 'output': return 'text-green-300';
    case 'error': return 'text-red-400';
    case 'system': return 'text-blue-400 italic';
    case 'prompt': return 'text-green-400';
    default: return 'text-green-300';
  }
}

function IntentBadge({ time, intent, confidence }: { time: string; intent: string; confidence: number }) {
  const colors: Record<string, string> = {
    cloud_recon: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
    credential_hunting: 'bg-danger-100 text-danger-800 dark:bg-danger-900 dark:text-danger-200',
    privilege_escalation: 'bg-warning-100 text-warning-800 dark:bg-warning-900 dark:text-warning-200',
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500 w-12">{time}</span>
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[intent] || 'bg-slate-100 text-slate-800'}`}>
        {intent.replace('_', ' ')}
      </span>
      <span className="text-slate-500 text-xs">{(confidence * 100).toFixed(0)}%</span>
    </div>
  );
}

function AdaptationItem({ time, desc }: { time: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-slate-500 w-12">{time}</span>
      <span className="text-slate-700 dark:text-slate-300">{desc}</span>
    </div>
  );
}