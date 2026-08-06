'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
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
} from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'notifications' | 'advanced'>('general');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const testConnection = async (service: string) => {
    setTesting(service);
    setTestResults((prev) => ({ ...prev, [service]: { success: false, message: 'Testing...' } }));

    // Simulate connection test
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const success = Math.random() > 0.3;
    setTestResults((prev) => ({
      ...prev,
      [service]: {
        success,
        message: success ? 'Connection successful' : 'Connection failed - check configuration',
      },
    }));
    setTesting(null);
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
            <p className="text-gray-500 mt-1">Configure CloudDecept dashboard and backend services</p>
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
                      <select className="input">
                        <option value="5">5 seconds</option>
                        <option value="10" selected>10 seconds</option>
                        <option value="30">30 seconds</option>
                        <option value="60">1 minute</option>
                        <option value="300">5 minutes</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Default Page Size</label>
                      <select className="input">
                        <option value="10">10 items</option>
                        <option value="20" selected>20 items</option>
                        <option value="50">50 items</option>
                        <option value="100">100 items</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                      <select className="input">
                        <option value="utc" selected>UTC</option>
                        <option value="local">Local Timezone</option>
                        <option value="us-east">US Eastern</option>
                        <option value="us-west">US Western</option>
                        <option value="eu-central">EU Central</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
                      <select className="input">
                        <option value="iso" selected>ISO (YYYY-MM-DD)</option>
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
                      { id: 'sound_alerts', label: 'Play sound for high-threat alerts', default: false },
                    ].map((pref) => (
                      <label key={pref.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{pref.label}</p>
                        </div>
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
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Backend Services</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Configure connection URLs for CloudDecept microservices. Changes require a dashboard restart.
                  </p>
                  <div className="space-y-4">
                    {[
                      { key: 'BACKEND_URL', label: 'Backend API', default: 'http://localhost:8000', icon: Database },
                      { key: 'COLLECTOR_URL', label: 'Event Collector', default: 'http://localhost:8000', icon: Globe },
                      { key: 'THREAT_INTEL_URL', label: 'Threat Intelligence', default: 'http://localhost:8005', icon: Shield },
                      { key: 'ADAPTIVE_URL', label: 'Adaptive Engine', default: 'http://localhost:8002', icon: Shield },
                      { key: 'INTENT_URL', label: 'Intent Engine', default: 'http://localhost:8001', icon: Terminal },
                    ].map((service) => (
                      <div key={service.key} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                        <div className="p-2 bg-primary-100 rounded-lg">
                          <service.icon className="w-5 h-5 text-primary-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="block text-sm font-medium text-gray-700">{service.label}</label>
                          <input
                            type="url"
                            defaultValue={service.default}
                            className="input font-mono text-sm mt-1"
                            placeholder={service.default}
                          />
                        </div>
                        <button
                          onClick={() => testConnection(service.key)}
                          disabled={testing === service.key}
                          className="btn-secondary text-sm whitespace-nowrap"
                        >
                          {testing === service.key ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                              Testing...
                            </>
                          ) : (
                            'Test'
                          )}
                        </button>
                        {testResults[service.key] && (
                          <span
                            className={cn(
                              'flex items-center gap-1 text-sm',
                              testResults[service.key].success ? 'text-green-600' : 'text-red-600'
                            )}
                          >
                            {testResults[service.key].success ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              <AlertCircle className="w-4 h-4" />
                            )}
                            {testResults[service.key].message}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Database Configuration</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    These settings are typically configured via environment variables in production.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'ClickHouse Host', default: 'localhost', type: 'text' },
                      { label: 'ClickHouse Port', default: '9000', type: 'number' },
                      { label: 'ClickHouse Database', default: 'deception', type: 'text' },
                      { label: 'PostgreSQL Host', default: 'localhost', type: 'text' },
                      { label: 'PostgreSQL Port', default: '5432', type: 'number' },
                      { label: 'PostgreSQL Database', default: 'deception', type: 'text' },
                      { label: 'Redis Host', default: 'localhost', type: 'text' },
                      { label: 'Redis Port', default: '6379', type: 'number' },
                    ].map((field) => (
                      <div key={field.label}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                        <input
                          type={field.type}
                          defaultValue={field.default}
                          className="input font-mono text-sm"
                        />
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
                  <div className="space-y-4">
                    {[
                      { id: 'alert_high_threat', label: 'High threat score detected (≥70)', channels: ['email', 'webhook', 'slack'], enabled: true },
                      { id: 'alert_new_attacker', label: 'New attacker IP seen', channels: ['webhook'], enabled: true },
                      { id: 'alert_credential_access', label: 'Credential access intent detected', channels: ['email', 'slack'], enabled: true },
                      { id: 'alert_data_exfil', label: 'Data exfiltration attempt', channels: ['email', 'webhook', 'slack', 'pagerduty'], enabled: true },
                      { id: 'alert_session_count', label: 'Unusual session spike (>10/min)', channels: ['webhook'], enabled: false },
                      { id: 'alert_adaptation_failure', label: 'Adaptation strategy failed', channels: ['webhook', 'slack'], enabled: false },
                    ].map((alert) => (
                      <div key={alert.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                defaultChecked={alert.enabled}
                                className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                              />
                              <div>
                                <p className="font-medium text-gray-900">{alert.label}</p>
                                <p className="text-sm text-gray-500">
                                  Notify via: {alert.channels.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}
                                </p>
                              </div>
                            </label>
                          </div>
                          <button className="btn-secondary text-sm">Configure</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Channels</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { name: 'Email', icon: '📧', fields: ['SMTP Host', 'SMTP Port', 'Username', 'Password', 'From Address'] },
                      { name: 'Slack', icon: '💬', fields: ['Webhook URL', 'Channel', 'Username'] },
                      { name: 'Webhook', icon: '🔗', fields: ['URL', 'Secret', 'Events'] },
                      { name: 'PagerDuty', icon: '📟', fields: ['Integration Key', 'Service ID'] },
                    ].map((channel) => (
                      <div key={channel.name} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-2xl">{channel.icon}</span>
                          <div>
                            <h4 className="font-medium text-gray-900">{channel.name}</h4>
                            <p className="text-sm text-gray-500">Not configured</p>
                          </div>
                        </div>
                        <button className="btn-secondary text-sm w-full">Configure</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Tuning</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Max Sessions in Memory</label>
                      <input type="number" defaultValue={1000} className="input" min={100} max={10000} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event Buffer Size</label>
                      <input type="number" defaultValue={500} className="input" min={50} max={5000} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">API Timeout (ms)</label>
                      <input type="number" defaultValue={5000} className="input" min={1000} max={60000} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SSE Reconnect Delay (ms)</label>
                      <input type="number" defaultValue={3000} className="input" min={1000} max={30000} />
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Debug & Logging</h3>
                  <div className="space-y-4">
                    {[
                      { id: 'debug_mode', label: 'Enable debug mode', desc: 'Show detailed error messages and API requests' },
                      { id: 'log_api_requests', label: 'Log API requests', desc: 'Log all API requests to console' },
                      { id: 'log_sse_events', label: 'Log SSE events', desc: 'Log all Server-Sent Events to console' },
                      { id: 'mock_data', label: 'Use mock data', desc: 'Use mock data instead of connecting to backend (development only)' },
                    ].map((opt) => (
                      <label key={opt.id} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 mt-0.5"
                        />
                        <div>
                          <p className="font-medium text-gray-900">{opt.label}</p>
                          <p className="text-sm text-gray-500">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h3>
                  <div className="space-y-3">
                    <button className="btn-secondary w-full md:w-auto justify-start">
                      Export Session Data (JSON)
                    </button>
                    <button className="btn-secondary w-full md:w-auto justify-start">
                      Export Threat Intelligence Report
                    </button>
                    <button className="btn-danger w-full md:w-auto justify-start">
                      Clear All Local Data
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
  );
}