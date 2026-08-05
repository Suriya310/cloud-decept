'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Activity,
  Terminal,
  Shield,
  AlertTriangle,
  Database,
  Cpu,
  Globe,
  Settings,
  ChevronLeft,
  X,
  Menu,
  Bell,
  RefreshCw,
  TrendingUp,
  Clock,
  Users,
  Zap,
  Network,
} from 'lucide-react';

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Sessions', href: '/sessions', icon: Activity },
  { name: 'Live Terminal', href: '/terminal', icon: Terminal },
  { name: 'Threat Intel', href: '/intel', icon: Shield },
  { name: 'Alerts', href: '/alerts', icon: AlertTriangle },
  { name: 'Configuration', href: '/config', icon: Settings },
];

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <>
      <button
        onClick={onClose}
        className={`fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-white dark:bg-slate-800 shadow-lg ${isOpen ? 'left-64' : ''}`}
        aria-label="Close sidebar"
      >
        <X className="w-5 h-5" />
      </button>

      <div
        className={`fixed inset-0 z-40 lg:hidden bg-black/50 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed lg:sticky top-0 h-screen w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-300 z-40 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Main navigation"
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary-600" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">CloudDecept</span>
          </Link>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Adaptive Cloud Deception</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <Cpu className="w-5 h-5 text-primary-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">System Status</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">All Systems Operational</p>
            </div>
            <span className="badge badge-success">Live</span>
          </div>
        </div>
      </aside>
    </>
  );
}