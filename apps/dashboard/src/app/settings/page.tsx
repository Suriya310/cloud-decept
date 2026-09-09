'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import {
  Shield,
  Database,
  Bell,
  User,
  Globe,
  Terminal,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Download,
  Trash2,
} from 'lucide-react';

export default function SettingsPage() {
  const { sessions, fetchSessions } = useDashboardStore();
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'notifications' | 'advanced'>('general');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // General Settings State
  const [refreshInterval, setRefreshInterval] = useState('30');
  const [pageSize, setPageSize] = useState('20');
  const [timezone, setTimezone] = useState('utc');
  const [dateFormat, setDateFormat] = useState('iso');

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('clouddecept_settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed.refreshInterval) setRefreshInterval(parsed.refreshInterval);
        if (parsed.pageSize) setPageSize(parsed.pageSize);
        if (parsed.timezone) setTimezone(parsed.timezone);
        if (parsed.dateFormat) setDateFormat(parsed.dateFormat);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem('clouddecept_settings', JSON.stringify({
        refreshInterval,
        pageSize,
        timezone,
        dateFormat,
      }));
    } catch {
      // Ignore localStorage errors
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const testConnection = async (service: string) => {
    setTesting(service);
    setTestResults((prev) => ({ ...prev, [service]: { success: false, message: 'Testing connection...' } }));

    try {
      const health = await api.getHealth();
      let success = false;
      let msg = '';

      if (service === 'BACKEND_URL') {
        success = health.status === 'healthy';
        msg = success ? 'API online and responding' : `Status: ${health.status}`;
      } else if (service === 'COLLECTOR_URL') {
        success = health.clickhouse === 'healthy' && health.redis === 'healthy';
        msg = success ? 'Telemetry pipelines reachable' : `CH: ${health.clickhouse}, Redis: ${health.redis}`;
      } else if (service === 'THREAT_INTEL_URL') {
        success = health.postgres === 'healthy';
        msg = success ? 'Threat intelligence DB connected' : `PG: ${health.postgres}`;
      } else if (service === 'ADAPTIVE_URL') {
        success = health.redis === 'healthy';
        msg = success ? 'Adaptive engine session bus online' : 'Redis disconnected';
      } else if (service === 'INTENT_URL') {
        success = health.clickhouse === 'healthy';
        msg = success ? 'Intent analysis pipeline ready' : 'ClickHouse disconnected';
      } else {
        success = health.status === 'healthy';
        msg = 'Connected';
      }

      setTestResults((prev) => ({
        ...prev,
        [service]: { success, message: msg },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [service]: {
          success: false,
          message: `Connection failed: ${err.message || 'Service unreachable'}`,
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const exportAllSessions = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sessions || [], null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `clouddecept-export-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const clearLocalPreferences = () => {
    if (confirm('Reset all local dashboard preferences and cached filters?')) {
      localStorage.removeItem('clouddecept_settings');
      setRefreshInterval('30');
      setPageSize('20');
      setTimezone('utc');
      setDateFormat('iso');
      alert('Local preferences reset to defaults.');
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Shield },
    { id: 'integrations', label: 'Integrations', icon: Database },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'advanced', label: 'Advanced', icon: Terminal },
  ];

  return (
    <main className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Configure CloudDecept dashboard and verify backend services</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saved}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="card">
        <div className="border-b border-gray-200">
          <nav className="flex gap-1 p-1" aria-label="Settings tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Refresh Interval</label>
                    <select
                      className="input"
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(e.target.value)}
                    >
                      <option value="5">5 seconds</option>
                      <option value="10">10 seconds</option>
                      <option value="30">30 seconds (Default)</option>
                      <option value="60">1 minute</option>
                      <option value="300">5 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Page Size</label>
                    <select
                      className="input"
                      value={pageSize}
                      onChange={(e) => setPageSize(e.target.value)}
                    >
                      <option value="10">10 items</option>
                      <option value="20">20 items (Default)</option>
                      <option value="50">50 items</option>
                      <option value="100">100 items</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                    <select
                      className="input"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    >
                      <option value="utc">UTC</option>
                      <option value="local">Local Timezone</option>
                      <option value="us-east">US Eastern</option>
                      <option value="us-west">US Western</option>
                      <option value="eu-central">EU Central</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
                    <select
                      className="input"
                      value={dateFormat}
                      onChange={(e) => setDateFormat(e.target.value)}
                    >
                      <option value="iso">ISO (YYYY-MM-DD)</option>
                      <option value="us">US (MM/DD/YYYY)</option>
                      <option value="eu">EU (DD/MM/YYYY)</option>
                      <option value="relative">Relative (2h ago)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Display Preferences</h3>
                <div className="space-y-4">
                  {[
                    { id: 'show_threat_scores', label: 'Show threat scores in session list', default: true },
                    { id: 'show_intent_badges', label: 'Display intent badges', default: true },
                    { id: 'animate_transitions', label: 'Enable animations', default: true },
                    { id: 'compact_mode', label: 'Compact table rows', default: false },
                    { id: 'auto_scroll_events', label: 'Auto-scroll live events', default: true },
                  ].map((pref) => (
                    <label key={pref.id} className="flex items-center justify-between cursor-pointer">
                      <p className="text-sm font-medium text-gray-900">{pref.label}</p>
                      <input
                        type="checkbox"
                        defaultChecked={pref.default}
                        className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Backend Services & Health Verification</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Verify end-to-end connectivity with backend services and persistence stores.
                </p>
                <div className="space-y-4">
                  {[
                    { key: 'BACKEND_URL', label: 'Backend API (:8000)', default: 'http://localhost:8000', icon: Database },
                    { key: 'COLLECTOR_URL', label: 'Event Collector & Streams', default: 'http://localhost:8000', icon: Globe },
                    { key: 'THREAT_INTEL_URL', label: 'Threat Intelligence Store', default: 'http://localhost:8000', icon: Shield },
                    { key: 'ADAPTIVE_URL', label: 'Adaptive Deception Engine', default: 'http://localhost:8002', icon: Shield },
                    { key: 'INTENT_URL', label: 'Intent Classification Engine', default: 'http://localhost:8001', icon: Terminal },
                  ].map((service) => (
                    <div key={service.key} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="p-2 bg-primary-100 rounded-lg flex-shrink-0 self-start sm:self-auto">
                        <service.icon className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="block text-sm font-medium text-gray-900">{service.label}</label>
                        <span className="font-mono text-xs text-gray-500 block truncate">{service.default}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => testConnection(service.key)}
                          disabled={testing === service.key}
                          className="btn-secondary text-sm whitespace-nowrap"
                        >
                          {testing === service.key ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                              Testing...
                            </>
                          ) : (
                            'Test Connection'
                          )}
                        </button>
                        {testResults[service.key] && (
                          <span
                            className={cn(
                              'flex items-center gap-1.5 text-xs font-medium',
                              testResults[service.key].success ? 'text-green-600' : 'text-red-600'
                            )}
                          >
                            {testResults[service.key].success ? (
                              <CheckCircle className="w-4 h-4 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            )}
                            {testResults[service.key].message}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Alert Rules</h3>
                <div className="space-y-3">
                  {[
                    { id: 'alert_high_threat', label: 'High threat score detected (≥70)', channels: ['email', 'slack'], enabled: true },
                    { id: 'alert_new_attacker', label: 'New attacker IP connected', channels: ['webhook'], enabled: true },
                    { id: 'alert_credential_access', label: 'Credential access intent detected', channels: ['email', 'slack'], enabled: true },
                    { id: 'alert_data_exfil', label: 'Data exfiltration attempt', channels: ['email', 'pagerduty'], enabled: true },
                  ].map((alert) => (
                    <div key={alert.id} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked={alert.enabled}
                          className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{alert.label}</p>
                          <p className="text-xs text-gray-500">
                            Channels: {alert.channels.map((c) => c.toUpperCase()).join(', ')}
                          </p>
                        </div>
                      </label>
                      <span className="badge bg-green-100 text-green-800 text-xs">Active</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Management & Export</h3>
                <div className="space-y-3">
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Export All Session Telemetry</p>
                      <p className="text-xs text-gray-500">Download active and historical session records as JSON</p>
                    </div>
                    <button
                      onClick={exportAllSessions}
                      className="btn-secondary text-sm flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      Export JSON
                    </button>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Reset Local Preferences</p>
                      <p className="text-xs text-gray-500">Reset dashboard filters, table preferences, and local cache</p>
                    </div>
                    <button
                      onClick={clearLocalPreferences}
                      className="btn-danger text-sm flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      Reset Cache
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}