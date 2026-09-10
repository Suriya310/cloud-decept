/**
 * Canonical intent normalization utility for CloudDecept Dashboard.
 * Distinguishes genuine backend classifications from unclassified or failed states:
 * - Empty / null -> "Not Classified"
 * - "unknown" / "unknown activity" -> "Unclassified Activity"
 * - "Unknown - summarization failed" -> "Analysis Unavailable"
 * - Standard MITRE / CloudDecept intents -> Formatted Title Case
 */

export interface IntentInfo {
  label: string;
  badgeClass: string;
  category: 'classified' | 'unclassified' | 'failed';
  description: string;
  isUnclassified: boolean;
}

export function normalizeIntent(rawIntent?: string | null): IntentInfo {
  if (!rawIntent || rawIntent.trim() === '' || rawIntent.toLowerCase() === 'null') {
    return {
      label: 'Not Classified',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
      category: 'unclassified',
      description: 'Session disconnected before actionable command patterns were observed',
      isUnclassified: true,
    };
  }

  const clean = rawIntent.trim();
  const lower = clean.toLowerCase();

  // Failed summarization / analysis
  if (lower.includes('summarization failed') || lower.includes('failed')) {
    return {
      label: 'Analysis Unavailable',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      category: 'failed',
      description: 'Automated threat summarizer encountered parsing limitations',
      isUnclassified: false,
    };
  }

  // Unknown activity / unclassified pattern
  if (lower === 'unknown' || lower === 'unknown activity' || lower === 'observation' || lower === 'unclassified') {
    return {
      label: 'Unclassified Activity',
      badgeClass: 'bg-gray-100 text-gray-800 border-gray-200',
      category: 'unclassified',
      description: 'Commands executed did not match known high-risk cloud attack signatures',
      isUnclassified: true,
    };
  }

  // Known intent categories
  if (lower.includes('credential') || lower.includes('steal') || lower.includes('hunting')) {
    return {
      label: 'Credential Hunting',
      badgeClass: 'bg-red-950/60 text-red-300 border-red-500/40',
      category: 'classified',
      description: 'Adversary attempting to locate AWS keys, SSH credentials, or environment secrets',
      isUnclassified: false,
    };
  }

  if (lower.includes('account') || lower.includes('user')) {
    return {
      label: 'Account Discovery',
      badgeClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
      category: 'classified',
      description: 'Adversary enumerating local user accounts, sudoers, or logged-in users',
      isUnclassified: false,
    };
  }

  if (lower.includes('file') || lower.includes('directory')) {
    return {
      label: 'File & Directory Discovery',
      badgeClass: 'bg-teal-950/60 text-teal-300 border-teal-500/40',
      category: 'classified',
      description: 'Adversary mapping directory structures, sensitive configuration files, or honeypot file systems',
      isUnclassified: false,
    };
  }

  if (lower.includes('network')) {
    return {
      label: 'Network Discovery',
      badgeClass: 'bg-blue-950/60 text-blue-300 border-blue-500/40',
      category: 'classified',
      description: 'Adversary inspecting network interfaces, routes, active sockets, or ARP tables',
      isUnclassified: false,
    };
  }

  if (lower.includes('process')) {
    return {
      label: 'Process Discovery',
      badgeClass: 'bg-indigo-950/60 text-indigo-300 border-indigo-500/40',
      category: 'classified',
      description: 'Adversary inspecting running system processes, daemons, or security agents',
      isUnclassified: false,
    };
  }

  if (lower.includes('cloud') || lower.includes('recon')) {
    return {
      label: 'Cloud Reconnaissance',
      badgeClass: 'bg-sky-950/60 text-sky-300 border-sky-500/40',
      category: 'classified',
      description: 'Adversary probing cloud infrastructure, IAM policies, and cloud metadata endpoints',
      isUnclassified: false,
    };
  }

  if (lower.includes('discovery') || lower.includes('system')) {
    return {
      label: 'System Discovery',
      badgeClass: 'bg-blue-950/60 text-blue-300 border-blue-500/40',
      category: 'classified',
      description: 'Adversary enumerating host architecture, kernel version, or OS configuration',
      isUnclassified: false,
    };
  }

  if (lower.includes('privilege') || lower.includes('escalation')) {
    return {
      label: 'Privilege Escalation',
      badgeClass: 'bg-orange-950/60 text-orange-300 border-orange-500/40',
      category: 'classified',
      description: 'Adversary attempting root elevation or IAM role assumption',
      isUnclassified: false,
    };
  }

  if (lower.includes('data') || lower.includes('exfil') || lower.includes('access')) {
    return {
      label: 'Data Exfiltration',
      badgeClass: 'bg-purple-950/60 text-purple-300 border-purple-500/40',
      category: 'classified',
      description: 'Adversary downloading decoy files or staging exfiltration channels',
      isUnclassified: false,
    };
  }

  if (lower.includes('persist')) {
    return {
      label: 'Persistence',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
      category: 'classified',
      description: 'Adversary establishing backdoor cron jobs, SSH keys, or persistence hooks',
      isUnclassified: false,
    };
  }

  if (lower.includes('lateral') || lower.includes('move')) {
    return {
      label: 'Lateral Movement',
      badgeClass: 'bg-pink-950/60 text-pink-300 border-pink-500/40',
      category: 'classified',
      description: 'Adversary probing internal subnets and adjacent decoy nodes',
      isUnclassified: false,
    };
  }

  if (lower.includes('damage') || lower.includes('destroy') || lower.includes('evasion')) {
    return {
      label: 'Defense Evasion',
      badgeClass: 'bg-rose-950/60 text-rose-300 border-rose-500/40',
      category: 'classified',
      description: 'Adversary disabling logs, history files, or evasion tooling',
      isUnclassified: false,
    };
  }

  if (lower.includes('ingress') || lower.includes('transfer') || lower.includes('tool')) {
    return {
      label: 'Tool Ingress / Transfer',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
      category: 'classified',
      description: 'Adversary attempting to stage external attack binaries or malware tooling',
      isUnclassified: false,
    };
  }

  // Clean fallback: replace underscores with spaces and capitalize
  const formatted = clean
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return {
    label: formatted,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    category: 'classified',
    description: `Adversary action pattern matching ${formatted}`,
    isUnclassified: false,
  };
}

export function getIntentBadgeClass(intent?: string | null): string {
  return normalizeIntent(intent).badgeClass;
}

export function getIntentDisplayLabel(intent?: string | null): string {
  return normalizeIntent(intent).label;
}
