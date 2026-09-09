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
      badgeClass: 'bg-red-100 text-red-800 border-red-200',
      category: 'classified',
      description: 'Adversary attempting to locate AWS keys, SSH credentials, or environment secrets',
      isUnclassified: false,
    };
  }

  if (lower.includes('recon') || lower.includes('discovery') || lower.includes('system')) {
    return {
      label: 'System Discovery',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
      category: 'classified',
      description: 'Adversary enumerating cloud architecture, host configuration, or system topology',
      isUnclassified: false,
    };
  }

  if (lower.includes('privilege') || lower.includes('escalation')) {
    return {
      label: 'Privilege Escalation',
      badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
      category: 'classified',
      description: 'Adversary attempting root elevation or IAM role assumption',
      isUnclassified: false,
    };
  }

  if (lower.includes('data') || lower.includes('exfil') || lower.includes('access')) {
    return {
      label: 'Data Exfiltration',
      badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
      category: 'classified',
      description: 'Adversary downloading decoy files or staging exfiltration channels',
      isUnclassified: false,
    };
  }

  if (lower.includes('persist')) {
    return {
      label: 'Persistence',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      category: 'classified',
      description: 'Adversary establishing backdoor cron jobs, SSH keys, or persistence hooks',
      isUnclassified: false,
    };
  }

  if (lower.includes('lateral') || lower.includes('move')) {
    return {
      label: 'Lateral Movement',
      badgeClass: 'bg-pink-100 text-pink-800 border-pink-200',
      category: 'classified',
      description: 'Adversary probing internal subnets and adjacent decoy nodes',
      isUnclassified: false,
    };
  }

  if (lower.includes('damage') || lower.includes('destroy') || lower.includes('evasion')) {
    return {
      label: 'Defense Evasion',
      badgeClass: 'bg-red-100 text-red-800 border-red-200',
      category: 'classified',
      description: 'Adversary disabling logs, history files, or evasion tooling',
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
