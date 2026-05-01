'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { RefreshCw, Eye, EyeOff, Check, X, Loader2 } from 'lucide-react';

interface StoredSecret {
  id: string;
  provider: string;
  keyName: string;
  maskedHint: string;
  updatedAt: string;
}

interface IntegrationDef {
  provider: string;
  name: string;
  keys: { keyName: string; label: string; placeholder: string }[];
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    provider: 'twilio',
    name: 'Twilio',
    keys: [
      { keyName: 'TWILIO_ACCOUNT_SID', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { keyName: 'TWILIO_AUTH_TOKEN', label: 'Auth Token', placeholder: 'Your Twilio auth token' },
    ],
  },
  {
    provider: 'docusign',
    name: 'DocuSign',
    keys: [
      { keyName: 'DOCUSIGN_CLIENT_ID', label: 'Integration Key', placeholder: 'Your DocuSign integration key' },
      { keyName: 'DOCUSIGN_CONNECT_SECRET', label: 'Connect Secret', placeholder: 'HMAC secret for webhook verification' },
    ],
  },
  {
    provider: 'attom',
    name: 'ATTOM Property API',
    keys: [
      { keyName: 'ATTOM_API_KEY', label: 'API Key', placeholder: 'Your ATTOM API key' },
    ],
  },
  {
    provider: 'google_geocoding',
    name: 'Google Geocoding',
    keys: [
      { keyName: 'GOOGLE_GEOCODING_API_KEY', label: 'API Key', placeholder: 'AIzaSy...' },
    ],
  },
  {
    provider: 'openai',
    name: 'OpenAI',
    keys: [
      { keyName: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-...' },
    ],
  },
  {
    provider: 'sendgrid',
    name: 'SendGrid',
    keys: [
      { keyName: 'SENDGRID_API_KEY', label: 'API Key', placeholder: 'SG.xxxxx' },
    ],
  },
  {
    provider: 'rentcast',
    name: 'RentCast',
    keys: [
      { keyName: 'RENTCAST_API_KEY', label: 'API Key', placeholder: 'Your RentCast API key' },
    ],
  },
  {
    provider: 'propertyradar',
    name: 'PropertyRadar',
    keys: [
      { keyName: 'PROPERTYRADAR_API_KEY', label: 'API Key', placeholder: 'Your PropertyRadar API key' },
    ],
  },
  {
    provider: 'openclaw',
    name: 'OpenClaw',
    keys: [
      { keyName: 'OPENCLAW_SECRET', label: 'Agent Secret', placeholder: 'Your OpenClaw agent secret' },
    ],
  },
];

type ConnStatus = 'idle' | 'testing' | 'connected' | 'error';

export default function IntegrationsPage() {
  const [secrets, setSecrets] = useState<StoredSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [connStatus, setConnStatus] = useState<Record<string, ConnStatus>>({});
  const [connError, setConnError] = useState<Record<string, string>>({});

  const fetchSecrets = useCallback(async () => {
    try {
      const res = await apiFetch('/integration-secrets');
      if (res.ok) {
        setSecrets(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch secrets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  const getStoredSecret = (provider: string, keyName: string) =>
    secrets.find((s) => s.provider === provider && s.keyName === keyName);

  const inputKey = (provider: string, keyName: string) =>
    `${provider}:${keyName}`;

  const handleSave = async (provider: string, keyName: string) => {
    const key = inputKey(provider, keyName);
    const value = inputValues[key]?.trim();
    if (!value) return;

    setSaving((p) => ({ ...p, [key]: true }));
    try {
      await apiFetch(`/integration-secrets/${provider}/${keyName}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      setInputValues((p) => ({ ...p, [key]: '' }));
      setShowValues((p) => ({ ...p, [key]: false }));
      await fetchSecrets();
    } catch (err) {
      console.error('Failed to save secret:', err);
    } finally {
      setSaving((p) => ({ ...p, [key]: false }));
    }
  };

  const handleDelete = async (provider: string, keyName: string) => {
    try {
      await apiFetch(`/integration-secrets/${provider}/${keyName}`, {
        method: 'DELETE',
      });
      await fetchSecrets();
    } catch (err) {
      console.error('Failed to delete secret:', err);
    }
  };

  const handleTest = async (provider: string) => {
    setConnStatus((p) => ({ ...p, [provider]: 'testing' }));
    setConnError((p) => ({ ...p, [provider]: '' }));
    try {
      const res = await apiFetch(`/integration-secrets/${provider}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setConnStatus((p) => ({
        ...p,
        [provider]: data.connected ? 'connected' : 'error',
      }));
      if (!data.connected && data.error) {
        setConnError((p) => ({ ...p, [provider]: data.error }));
      }
    } catch {
      setConnStatus((p) => ({ ...p, [provider]: 'error' }));
      setConnError((p) => ({ ...p, [provider]: 'Request failed' }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading integrations...
      </div>
    );
  }

  const statusBadge = (provider: string) => {
    const s = connStatus[provider];
    if (s === 'connected') return <Badge variant="success">Connected</Badge>;
    if (s === 'testing')
      return (
        <Badge variant="info">
          <Loader2 size={12} className="mr-1 animate-spin" />
          Testing
        </Badge>
      );
    if (s === 'error')
      return <Badge variant="destructive">Error</Badge>;

    const hasAny = INTEGRATIONS.find(
      (i) => i.provider === provider,
    )?.keys.some((k) => getStoredSecret(provider, k.keyName));
    if (hasAny) return <Badge variant="warning">Configured</Badge>;
    return <Badge variant="secondary">Not Configured</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage API keys and test external service connections
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSecrets}>
          <RefreshCw size={16} className="mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTEGRATIONS.map((integration) => (
          <Card key={integration.provider}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-foreground">
                  {integration.name}
                </CardTitle>
                {statusBadge(integration.provider)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {integration.keys.map((keyDef) => {
                const key = inputKey(integration.provider, keyDef.keyName);
                const stored = getStoredSecret(
                  integration.provider,
                  keyDef.keyName,
                );
                const isShowingInput = showValues[key];
                const isSaving = saving[key];

                return (
                  <div key={keyDef.keyName} className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {keyDef.label}
                    </label>

                    {stored && !isShowingInput ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-9 flex items-center px-3 rounded-md bg-secondary text-sm font-mono text-muted-foreground">
                          {stored.maskedHint}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0"
                          title="Update key"
                          onClick={() =>
                            setShowValues((p) => ({ ...p, [key]: true }))
                          }
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                          title="Remove key"
                          onClick={() =>
                            handleDelete(integration.provider, keyDef.keyName)
                          }
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          placeholder={keyDef.placeholder}
                          value={inputValues[key] || ''}
                          onChange={(e) =>
                            setInputValues((p) => ({
                              ...p,
                              [key]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              handleSave(
                                integration.provider,
                                keyDef.keyName,
                              );
                          }}
                          className={cn(
                            'flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm font-mono',
                            'text-foreground placeholder:text-muted-foreground',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          )}
                        />
                        <Button
                          size="sm"
                          className="h-9"
                          disabled={!inputValues[key]?.trim() || isSaving}
                          onClick={() =>
                            handleSave(integration.provider, keyDef.keyName)
                          }
                        >
                          {isSaving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                        </Button>
                        {stored && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0"
                            title="Cancel"
                            onClick={() =>
                              setShowValues((p) => ({
                                ...p,
                                [key]: false,
                              }))
                            }
                          >
                            <EyeOff size={14} />
                          </Button>
                        )}
                      </div>
                    )}

                    {stored && (
                      <p className="text-[10px] text-muted-foreground">
                        Last updated{' '}
                        {new Date(stored.updatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(integration.provider)}
                  disabled={connStatus[integration.provider] === 'testing'}
                >
                  {connStatus[integration.provider] === 'testing' ? (
                    <>
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
                {connError[integration.provider] && (
                  <span className="text-xs text-destructive max-w-[200px] truncate">
                    {connError[integration.provider]}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhook Endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: 'Twilio Inbound', path: '/api/webhooks/twilio/inbound' },
            { label: 'Twilio Status', path: '/api/webhooks/twilio/status' },
            { label: 'DocuSign Connect', path: '/api/webhooks/docusign' },
          ].map((wh) => (
            <div
              key={wh.path}
              className="flex items-center justify-between p-3 rounded-md bg-secondary"
            >
              <div>
                <div className="text-sm font-medium text-foreground">
                  {wh.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  POST {wh.path}
                </div>
              </div>
              <code className="text-xs bg-background px-2 py-1 rounded text-muted-foreground">
                http://localhost:3001{wh.path}
              </code>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security Note</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All API keys are encrypted at rest using AES-256-GCM before being
            stored in the database. Plaintext values are never persisted or
            returned by the API. Only a masked hint (last 4 characters) is
            shown in the console for identification.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
