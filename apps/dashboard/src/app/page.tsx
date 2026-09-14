'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Activity,
  Terminal,
  Target,
  KeyRound,
  AlertTriangle,
  Globe,
  Radio,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Zap,
  Play,
  Pause,
  AlertOctagon,
  CheckCircle2,
} from 'lucide-react';
import { cn, formatTimestamp, formatDuration } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { GeographicMap } from '@/components/GeographicMap';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';
import { evaluateThreat } from '@/lib/threatScore';

export default function OverviewPage() {
  const router = useRouter();
  const {
    stats,
    statsLoading,
    fetchStats,
    sessions,
    fetchSessions,
    topAttackers,
    fetchTopAttackers,
    topCommands,
    fetchTopCommands,
    realTimeEvents,
    isLiveConnected,
    subscribeToEvents,
    timeWindowHours,
  } = useDashboardStore();

  const [livePaused, setLivePaused] = useState(false);

  // Subscribe to live SSE overlay
  useEffect(() => {
    const unsubscribe = subscribeToEvents();
    return () => unsubscribe();
  }, [subscribeToEvents]);

  // Fetch authoritative REST telemetry on mount & time window change
  useEffect(() => {
    fetchStats(timeWindowHours);
    fetchSessions({ hours: timeWindowHours, limit: 15 });
    fetchTopAttackers(timeWindowHours, 6);
    fetchTopCommands(timeWindowHours, 6);
  }, [fetchStats, fetchSessions, fetchTopAttackers, fetchTopCommands, timeWindowHours]);

  const windowLabel =
    timeWindowHours >= 87600 ? 'ALL-TIME' :
    timeWindowHours === 1 ? 'LAST 1 HOUR' :
    timeWindowHours === 24 ? 'LAST 24 HOURS' :
    timeWindowHours === 168 ? 'LAST 7 DAYS' :
    timeWindowHours === 720 ? 'LAST 30 DAYS' : `LAST ${timeWindowHours}H`;

  // Filtered live events for display
  const displayedLiveEvents = useMemo(() => {
    if (livePaused) return [];
    return (realTimeEvents || []).slice(0, 15);
  }, [realTimeEvents, livePaused]);

  // High risk threat calculations
  const highRiskThreatsCount = useMemo(() => {
    const threatDist = stats?.threat_distribution || [];
    const crit = threatDist.find(t => t.level.toLowerCase() === 'critical')?.count || 0;
    const high = threatDist.find(t => t.level.toLowerCase() === 'high')?.count || 0;
    return crit + high;
  }, [stats]);

  // Country data for geographic map
  const mapData = useMemo(() => {
    return (stats?.top_countries || []).map(c => ({
      country: c.country,
      count: c.count,
    }));
  }, [stats]);

  const handleCountrySelect = useCallback((countryCode: string) => {
    router.push(`/sessions?country=${encodeURIComponent(countryCode)}`);
  }, [router]);

  return (
    <div className="space-y-6 font-mono pb-12">
      {/* Overview Top Command Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-cyan-500/15">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-white uppercase flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-cyan-400" />
            <span>CYBER DECEPTION COMMAND CENTER</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Global Honeypot Operations & Real-time Adversary Deception HUD • Window: <span className="text-cyan-300 font-bold">{windowLabel}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              fetchStats(timeWindowHours);
              fetchSessions({ hours: timeWindowHours, limit: 15 });
              fetchTopAttackers(timeWindowHours, 6);
              fetchTopCommands(timeWindowHours, 6);
            }}
            className="p-2 rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 hover:text-cyan-300"
            title="Refresh overview metrics"
          >
            <RefreshCw className={cn('w-4 h-4', statsLoading && 'animate-spin text-cyan-400')} />
          </button>
        </div>
      </div>

      {/* TOP METRICS GRID (Explicitly Scope-Labeled) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Active Sessions */}
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-cyan-500/20 relative overflow-hidden">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>ACTIVE SESSIONS</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {stats?.active_sessions ?? 0}
          </div>
          <div className="text-[9px] text-emerald-400 font-bold mt-0.5 tracking-wider">
            CONNECTED NOW
          </div>
        </div>

        {/* Sessions in Window / All-Time */}
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-cyan-500/20">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>TOTAL SESSIONS</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {timeWindowHours >= 87600
              ? (stats?.total_sessions ?? 0).toLocaleString()
              : (stats?.recent_sessions ?? 0).toLocaleString()}
          </div>
          <div className="text-[9px] text-cyan-300 font-bold mt-0.5 tracking-wider">
            {windowLabel}
          </div>
        </div>

        {/* Commands Executed */}
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-cyan-500/20">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>COMMANDS RUN</span>
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {timeWindowHours >= 87600
              ? (stats?.total_commands ?? 0).toLocaleString()
              : (stats?.recent_commands ?? 0).toLocaleString()}
          </div>
          <div className="text-[9px] text-cyan-300 font-bold mt-0.5 tracking-wider">
            {windowLabel}
          </div>
        </div>

        {/* Unique Attackers */}
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-cyan-500/20">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>UNIQUE ATTACKERS</span>
            <Target className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {timeWindowHours >= 87600
              ? (stats?.unique_attackers ?? 0).toLocaleString()
              : (stats?.recent_unique_attackers ?? 0).toLocaleString()}
          </div>
          <div className="text-[9px] text-cyan-300 font-bold mt-0.5 tracking-wider">
            {windowLabel}
          </div>
        </div>

        {/* High / Critical Threats */}
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-rose-500/30">
          <div className="text-[10px] text-rose-400 uppercase flex items-center justify-between">
            <span>HIGH/CRIT THREATS</span>
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-1">
            {highRiskThreatsCount.toLocaleString()}
          </div>
          <div className="text-[9px] text-slate-400 font-bold mt-0.5 tracking-wider">
            ALL-TIME ASSESSED
          </div>
        </div>

        {/* Adaptive Deceptions */}
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-purple-500/30">
          <div className="text-[10px] text-purple-400 uppercase flex items-center justify-between">
            <span>DECEPTION ENGAGED</span>
            <Zap className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-300 mt-1">
            {(stats?.recent_commands ?? 0) > 0 ? (stats?.recent_commands ?? 0) : 'ACTIVE'}
          </div>
          <div className="text-[9px] text-purple-400 font-bold mt-0.5 tracking-wider">
            DECOYS DEPLOYED
          </div>
        </div>
      </div>

      {/* GEOGRAPHIC ATTACK MAP & LIVE ATTACK FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: World Attack Map */}
        <div className="lg:col-span-8 rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden flex flex-col">
          <div className="p-3.5 bg-[#040816] border-b border-cyan-500/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                GLOBAL ATTACK ORIGINS & ADVERSARY HOTSPOTS
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              Click any country to inspect its sessions
            </span>
          </div>

          <div className="flex-1 p-2 min-h-[380px] relative">
            <GeographicMap
              data={mapData}
              totalSessions={stats?.recent_sessions || stats?.total_sessions || 1}
              isLoading={statsLoading}
              onCountrySelect={handleCountrySelect}
            />
          </div>
        </div>

        {/* Right: Live Attack Activity Stream */}
        <div className="lg:col-span-4 rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden flex flex-col">
          <div className="p-3.5 bg-[#040816] border-b border-cyan-500/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className={cn('w-4 h-4', isLiveConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500')} />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                LIVE ATTACK FEED
              </span>
            </div>

            <button
              onClick={() => setLivePaused(!livePaused)}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              {livePaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              <span>{livePaused ? 'RESUME' : 'PAUSE'}</span>
            </button>
          </div>

          <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[420px] scrollbar-thin">
            {!isLiveConnected && (
              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300">
                Live stream disconnected. Operating under authoritative REST background polling.
              </div>
            )}

            {displayedLiveEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <Clock className="w-6 h-6 text-slate-600 mx-auto" />
                <p>Waiting for fresh incoming adversary telemetry...</p>
                <p className="text-[10px] text-slate-600">The safe live overlay streams newly ingested events without historical backlog.</p>
              </div>
            ) : (
              displayedLiveEvents.map((evt, idx) => {
                const data = (evt.data as any) || {};
                const eventType = evt.type || data.event_type || 'event';
                const sessionId = (evt as any).session_id || data.session_id || '';
                const attackerIp = (evt as any).attacker_ip || data.attacker_ip || 'unknown';

                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-[#040816] border border-cyan-500/15 text-xs space-y-1 hover:border-cyan-500/40 transition-all font-mono"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-cyan-400 font-bold uppercase">{eventType}</span>
                      <span className="text-slate-500">{formatTimestamp(evt.timestamp || new Date().toISOString())}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{attackerIp}</span>
                      {sessionId && (
                        <Link
                          href={`/sessions/${sessionId}`}
                          className="text-cyan-400 hover:underline text-[10px] flex items-center gap-0.5"
                        >
                          <span>{sessionId.slice(0, 8)}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      )}
                    </div>

                    {data.command && (
                      <div className="text-[11px] text-emerald-300 truncate bg-[#02050f] p-1 rounded">
                        $ {data.command}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* TOP ATTACKERS & TOP COMMANDS SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Attackers */}
        <div className="rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden">
          <div className="p-3.5 bg-[#040816] border-b border-cyan-500/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                TOP THREAT ACTORS ({windowLabel})
              </span>
            </div>
            <Link
              href="/attackers"
              className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-cyan-500/10">
            {(topAttackers || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No attacker activity recorded in this time window.
              </div>
            ) : (
              (topAttackers || []).slice(0, 5).map((att) => {
                const threat = evaluateThreat(att.max_skill_level ?? 2);
                const country = getCountryName(att.country);
                return (
                  <div
                    key={att.attacker_ip}
                    className="p-3 flex items-center justify-between hover:bg-cyan-950/20 transition-all text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{att.attacker_ip}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400 text-[11px]">{country}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {normalizeIntent(att.primary_intent).label}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-cyan-300 font-bold block">
                          {att.total_sessions || att.sessions || att.unique_sessions || 0} Sessions
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {att.total_commands ?? 0} Cmds
                        </span>
                      </div>

                      <Link
                        href={`/attackers?ip=${encodeURIComponent(att.attacker_ip)}`}
                        className="p-1 rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/30"
                        title="Investigate Attacker"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top Executed Commands */}
        <div className="rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden">
          <div className="p-3.5 bg-[#040816] border-b border-cyan-500/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                TOP EXECUTED COMMANDS ({windowLabel})
              </span>
            </div>
            <Link
              href="/commands"
              className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>Explore All</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-cyan-500/10">
            {(topCommands || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No shell commands executed in this time window.
              </div>
            ) : (
              (topCommands || []).slice(0, 5).map((cmd) => (
                <div
                  key={cmd.command}
                  className="p-3 flex items-center justify-between hover:bg-cyan-950/20 transition-all text-xs"
                >
                  <div className="space-y-0.5 truncate max-w-sm">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-emerald-400 font-bold">$</span>
                      <span className="font-bold text-white font-mono truncate">{cmd.command}</span>
                    </div>
                    {(cmd.external_executions !== undefined || cmd.internal_executions !== undefined) && (
                      <div className="text-[10px] text-slate-500 flex items-center gap-2">
                        <span className="text-emerald-400/80">{cmd.external_executions ?? 0} External</span>
                        <span>•</span>
                        <span className="text-amber-400/80">{cmd.internal_executions ?? 0} Internal</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <span className="text-emerald-400 font-bold block">
                        {cmd.executions} Runs
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {cmd.unique_sessions} Sessions • {cmd.unique_sources ?? cmd.unique_sessions} Sources
                      </span>
                    </div>

                    <Link
                      href={`/commands?search=${encodeURIComponent(cmd.command)}`}
                      className="p-1 rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/30"
                      title="Explore command forensic drill-down"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* RECENT CAPTURED SESSIONS TABLE */}
      <div className="rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden">
        <div className="p-3.5 bg-[#040816] border-b border-cyan-500/15 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              RECENT ATTACK SESSIONS ({windowLabel})
            </span>
          </div>
          <Link
            href="/sessions"
            className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
          >
            <span>View All Sessions</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#040816] text-[10px] text-slate-400 uppercase border-b border-cyan-500/15">
              <tr>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 px-4">SESSION ID</th>
                <th className="py-3 px-4">ATTACKER IP</th>
                <th className="py-3 px-4">ORIGIN</th>
                <th className="py-3 px-4">DURATION</th>
                <th className="py-3 px-4">COMMANDS</th>
                <th className="py-3 px-4">INTENT</th>
                <th className="py-3 px-4">THREAT</th>
                <th className="py-3 px-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/10 font-mono">
              {(sessions || []).slice(0, 8).map((s) => {
                const ip = s.src_ip || s.attacker_ip || 'unknown';
                const threat = evaluateThreat(s.threat_score ?? s.skill_level);
                const intent = normalizeIntent(s.intent);

                const statusPill =
                  s.status === 'active' ? (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                      ACTIVE NOW
                    </span>
                  ) : s.status === 'failed' ? (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      AUTH FAILED
                    </span>
                  ) : s.status === 'timed_out' ? (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      TIMED OUT
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                      CLOSED
                    </span>
                  );

                return (
                  <tr key={s.session_id} className="hover:bg-cyan-950/20 transition-all">
                    <td className="py-2.5 px-4">{statusPill}</td>
                    <td className="py-2.5 px-4 font-bold text-white">
                      <Link href={`/sessions/${s.session_id}`} className="text-cyan-400 hover:underline">
                        {s.session_id.slice(0, 10)}...
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 text-slate-200">
                      <Link href={`/attackers?ip=${encodeURIComponent(ip)}`} className="hover:text-cyan-300 hover:underline">
                        {ip}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {getCountryName(s.src_country || s.country)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      {formatDuration(s.duration_seconds || 0)}
                    </td>
                    <td className="py-2.5 px-4">
                      {(s.command_count || s.commands_executed || 0) > 0 ? (
                        <span className="text-emerald-400 font-bold">
                          {s.command_count || s.commands_executed}
                        </span>
                      ) : (
                        <span className="text-slate-600">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-700 text-slate-300">
                        {intent.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold border', threat.badgeClass)}>
                        {threat.label.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Link
                        href={`/sessions/${s.session_id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/25 transition-all"
                      >
                        <span>INVESTIGATE</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
