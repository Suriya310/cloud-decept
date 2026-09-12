
"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardStore } from "@/lib/store";
import { Target, Search, Clock, Terminal, Globe, ChevronDown, ChevronRight, Activity, ShieldAlert } from "lucide-react";
import { cn, formatTimestamp, getIntentColor } from "@/lib/utils";
import { getCountryName } from "@/lib/countries";
import { normalizeIntent } from "@/lib/intents";
import { evaluateThreat } from "@/lib/threatScore";
import Link from "next/link";

export default function AttackersPage() {
  const { topAttackers, fetchTopAttackers, timeWindowHours } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchTopAttackers(timeWindowHours, 100);
  }, [fetchTopAttackers, timeWindowHours]);

  const filteredAttackers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return topAttackers;
    return topAttackers.filter(
      (a) =>
        a.attacker_ip.toLowerCase().includes(q) ||
        (a.country || "").toLowerCase().includes(q) ||
        (a.primary_intent || "").toLowerCase().includes(q) ||
        getCountryName(a.country).toLowerCase().includes(q)
    );
  }, [topAttackers, searchQuery]);

  return (
    <main className="p-4 sm:p-6 lg:p-8 pt-20 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Target className="w-6 h-6 text-cyan-400" />
            Attacker Intelligence
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Top malicious actors tracked in the selected time window ({timeWindowHours === 87600 ? "All-Time" : `${timeWindowHours}H`})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search IP or country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-900/80 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>
        </div>
      </header>

      <div className="grid gap-4">
        {filteredAttackers.map((attacker) => {
          const threat = evaluateThreat(attacker.max_skill_level || 0);
          return (
            <div
              key={attacker.attacker_ip}
              className="bg-slate-900/40 border border-slate-800/80 rounded-xl overflow-hidden hover:border-cyan-500/30 transition-colors group"
            >
              <div className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-start gap-4 flex-1">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border",
                      threat.badgeClass
                      
                      
                    )}
                  >
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-mono text-lg font-bold text-slate-200 flex items-center gap-2">
                      {attacker.attacker_ip}
                      <span
                        className={cn(
                          "text-[10px] uppercase px-2 py-0.5 rounded-full border font-sans",
                          threat.badgeClass
                          
                          
                        )}
                      >
                        {threat.level} Threat
                      </span>
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-xs font-mono text-slate-400">
                      <span className="flex items-center gap-1.5" title="Country">
                        <Globe className="w-3.5 h-3.5" />
                        {getCountryName(attacker.country)} ({attacker.country})
                      </span>
                      <span className="flex items-center gap-1.5" title="Last Seen">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTimestamp(attacker.last_seen || '')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap md:flex-nowrap items-center gap-4 md:gap-8 w-full md:w-auto px-2">
                  <div className="text-center">
                    <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                      Sessions
                    </span>
                    <span className="font-mono font-bold text-slate-200 text-base">
                      {attacker.unique_sessions?.toLocaleString() ?? 0}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                      Total Cmds
                    </span>
                    <span className="font-mono font-bold text-slate-200 text-base">
                      {attacker.total_commands?.toLocaleString() ?? 0}
                    </span>
                  </div>
                  <div className="text-center min-w-[100px]">
                    <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                      Primary Intent
                    </span>
                    <span
                      className={cn(
                        "font-mono text-xs font-semibold px-2 py-1 rounded bg-slate-800",
                        getIntentColor(attacker.primary_intent || "")
                      )}
                    >
                      {normalizeIntent(attacker.primary_intent || "unknown").label}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center justify-end w-full md:w-auto">
                  <Link
                    href={`/sessions?q=${encodeURIComponent(attacker.attacker_ip)}`}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-cyan-900/40 text-slate-300 hover:text-cyan-300 rounded-lg text-xs font-semibold transition-all border border-slate-700 hover:border-cyan-500/50"
                  >
                    <Activity className="w-4 h-4" />
                    View Sessions
                  </Link>
                </div>
              </div>
            </div>
          );
        })}

        {filteredAttackers.length === 0 && (
          <div className="text-center py-20 border border-slate-800/50 rounded-xl bg-slate-900/20">
            <Target className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-slate-300 font-semibold">No Attackers Found</h3>
            <p className="text-sm text-slate-500 mt-1">
              Try adjusting your search or time window.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

