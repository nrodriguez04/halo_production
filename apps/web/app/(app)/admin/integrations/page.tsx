'use client';

import { useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState } from '@/components/states';
import { useReducedMotion, staggerDelay } from '@/lib/motion';
import { RefreshCw, Eye, EyeOff, Check, X, Loader2, ShieldCheck, Plug } from 'lucide-react';

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
      {
        keyName: 'TWILIO_ACCOUNT_SID',
        label: 'Account SID',
        placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      },
      { keyName: 'TWILIO_AUTH_TOKEN', label: 'Auth Token', placeholder: 'Your Twilio auth token' },
    ],
  },
  {
    provider: 'docusign',
    name: 'DocuSign',
    keys: [
      {
        keyName: 'DOCUSIGN_CLIENT_ID',
        label: 'Integration Key',
        placeholder: 'Your DocuSign integration key',
      },
      {
        keyName: 'DOCUSIGN_CONNECT_SECRET',
        label: 'Connect Secret',
        placeholder: 'HMAC secret for webhook verification',
      },
    ],
  },
  {
    provider: 'attom',
    name: 'ATTOM Property API',
    keys: [{ keyName: 'ATTOM_API_KEY', label: 'API Key', placeholder: 'Your ATTOM API key' }],
  },
  {
    provider: 'google_geocoding',
    name: 'Google Geocoding',
    keys: [{ keyName: 'GOOGLE_GEOCODING_API_KEY', label: 'API Key', placeholder: 'AIzaSy...' }],
  },
  {
    provider: 'openai',
    name: 'OpenAI',
    keys: [{ keyName: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-...' }],
  },
  {
    provider: 'sendgrid',
    name: 'SendGrid',
    keys: [{ keyName: 'SENDGRID_API_KEY', label: 'API Key', placeholder: 'SG.xxxxx' }],
  },
  {
    provider: 'rentcast',
    name: 'RentCast',
    keys: [{ keyName: 'RENTCAST_API_KEY', label: 'API Key', placeholder: 'Your RentCast API key' }],
  },
  {
    provider: 'propertyradar',
    name: 'PropertyRadar',
    keys: [
      {
        keyName: 'PROPERTYRADAR_API_KEY',
        label: 'API Key',
        placeholder: 'Your PropertyRadar API key',
      },
    ],
  },
  {
    provider: 'openclaw',
    name: 'OpenClaw',
    keys: [
      {
        keyName: 'OPENCLAW_SECRET',
        label: 'Agent Secret',
        placeholder: 'Your OpenClaw agent secret',
      },
    ],
  },
];

type ConnStatus = 'idle' | 'testing' | 'connected' | 'error';

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();

  const { data: secrets = [], isPending } = useApiQuery<StoredSecret[]>('/integration-secrets');

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [connStatus, setConnStatus] = useState<Record<string, ConnStatus>>({});
  const [connError, setConnError] = useState<Record<string, string>>({});

  const invalidateSecrets = () =>
    queryClient.invalidateQueries({ queryKey: ['/integration-secrets'] });

  const saveMutation = useApiMutation<
    { provider: string; keyName: string; value: string },
    unknown
  >(
    ({ provider, keyName, value }) =>
      apiJson(`/integration-secrets/${provider}/${keyName}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    {
      onSuccess: (_data, variables) => {
        toast.success(`${variables.keyName} saved`);
        const k = inputKey(variables.provider, variables.keyName);
        setInputValues((p) => ({ ...p, [k]: '' }));
        setShowValues((p) => ({ ...p, [k]: false }));
        invalidateSecrets();
      },
      onError: (err: any) => toast.error('Save failed', { description: err?.message }),
    },
  );

  const deleteMutation = useApiMutation<{ provider: string; keyName: string }, unknown>(
    ({ provider, keyName }) =>
      apiJson(`/integration-secrets/${provider}/${keyName}`, { method: 'DELETE' }),
    {
      onSuccess: (_d, vars) => {
        toast.success(`${vars.keyName} removed`);
        invalidateSecrets();
      },
      onError: (err: any) => toast.error('Delete failed', { description: err?.message }),
    },
  );

  const testMutation = useApiMutation<string, { connected?: boolean; error?: string }>(
    (provider) =>
      apiJson<{ connected?: boolean; error?: string }>(
        `/integration-secrets/${provider}/test`,
        { method: 'POST' },
      ),
    {
      onMutate: (provider) => {
        setConnStatus((p) => ({ ...p, [provider]: 'testing' }));
        setConnError((p) => ({ ...p, [provider]: '' }));
      },
      onSuccess: (data, provider) => {
        const ok = !!data.connected;
        setConnStatus((p) => ({ ...p, [provider]: ok ? 'connected' : 'error' }));
        if (ok) toast.success(`${provider} connected`);
        else if (data.error) {
          setConnError((p) => ({ ...p, [provider]: data.error! }));
          toast.error(`${provider} connectivity failed`, { description: data.error });
        }
      },
      onError: (err, provider) => {
        setConnStatus((p) => ({ ...p, [provider]: 'error' }));
        setConnError((p) => ({ ...p, [provider]: err?.message || 'Request failed' }));
        toast.error(`${provider} request failed`, { description: err?.message });
      },
    },
  );

  const getStoredSecret = (provider: string, keyName: string) =>
    secrets.find((s) => s.provider === provider && s.keyName === keyName);

  const inputKey = (provider: string, keyName: string) => `${provider}:${keyName}`;

  const handleSave = (provider: string, keyName: string) => {
    const k = inputKey(provider, keyName);
    const value = inputValues[k]?.trim();
    if (!value) return;
    saveMutation.mutate({ provider, keyName, value });
  };

  if (isPending) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Integrations" />
        <LoadingState />
      </div>
    );
  }

  const statusBadge = (provider: string) => {
    const s = connStatus[provider];
    if (s === 'connected') return <Badge variant="success">Connected</Badge>;
    if (s === 'testing')
      return (
        <Badge variant="info" className="gap-1">
          <Loader2 size={12} className="animate-spin" />
          Testing
        </Badge>
      );
    if (s === 'error') return <Badge variant="destructive">Error</Badge>;
    const hasAny = INTEGRATIONS.find((i) => i.provider === provider)?.keys.some((k) =>
      getStoredSecret(provider, k.keyName),
    );
    if (hasAny) return <Badge variant="warning">Configured</Badge>;
    return <Badge variant="secondary">Not Configured</Badge>;
  };

  const isSavingKey = (provider: string, keyName: string) =>
    saveMutation.isPending &&
    saveMutation.variables?.provider === provider &&
    saveMutation.variables?.keyName === keyName;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Integrations"
        description="Manage API keys and test external service connections."
        actions={
          <Button variant="outline" size="sm" onClick={invalidateSecrets}>
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {INTEGRATIONS.map((integration, i) => (
          <Card
            key={integration.provider}
            variant="interactive"
            className="animate-fade-up"
            style={{ animationDelay: staggerDelay(i, reduced, 30) }}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary"
                  >
                    <Plug size={14} />
                  </span>
                  <CardTitle className="text-body font-semibold">{integration.name}</CardTitle>
                </div>
                {statusBadge(integration.provider)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {integration.keys.map((keyDef) => {
                const k = inputKey(integration.provider, keyDef.keyName);
                const stored = getStoredSecret(integration.provider, keyDef.keyName);
                const isShowingInput = showValues[k];
                const isSaving = isSavingKey(integration.provider, keyDef.keyName);

                return (
                  <div key={keyDef.keyName} className="space-y-1.5">
                    <label className="text-caption font-medium text-muted-foreground">
                      {keyDef.label}
                    </label>

                    {stored && !isShowingInput ? (
                      <div className="flex items-center gap-2">
                        <div className="flex h-10 flex-1 items-center rounded-md border border-input bg-secondary/40 px-3 font-mono text-sm text-muted-foreground">
                          {stored.maskedHint}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setShowValues((p) => ({ ...p, [k]: true }))}
                              aria-label={`Update ${keyDef.label}`}
                            >
                              <Eye size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Update key</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                deleteMutation.mutate({
                                  provider: integration.provider,
                                  keyName: keyDef.keyName,
                                })
                              }
                              aria-label={`Remove ${keyDef.label}`}
                            >
                              <X size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove key</TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="password"
                          placeholder={keyDef.placeholder}
                          value={inputValues[k] || ''}
                          onChange={(e) =>
                            setInputValues((p) => ({ ...p, [k]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              handleSave(integration.provider, keyDef.keyName);
                          }}
                          className="font-mono"
                        />
                        <Button
                          size="icon"
                          loading={isSaving}
                          disabled={!inputValues[k]?.trim()}
                          onClick={() => handleSave(integration.provider, keyDef.keyName)}
                          aria-label="Save key"
                        >
                          <Check size={14} />
                        </Button>
                        {stored && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowValues((p) => ({ ...p, [k]: false }))}
                            aria-label="Cancel"
                          >
                            <EyeOff size={14} />
                          </Button>
                        )}
                      </div>
                    )}

                    {stored && (
                      <p className="text-[10px] text-muted-foreground">
                        Last updated {new Date(stored.updatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center justify-between border-t border-border pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  loading={connStatus[integration.provider] === 'testing'}
                  onClick={() => testMutation.mutate(integration.provider)}
                >
                  Test Connection
                </Button>
                {connError[integration.provider] && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="max-w-[200px] truncate text-caption text-destructive">
                        {connError[integration.provider]}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      {connError[integration.provider]}
                    </TooltipContent>
                  </Tooltip>
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
              className="flex items-center justify-between rounded-md border border-border bg-secondary/40 p-3"
            >
              <div>
                <p className="text-body font-medium text-foreground">{wh.label}</p>
                <p className="text-caption text-muted-foreground">POST {wh.path}</p>
              </div>
              <code className="rounded bg-background px-2 py-1 text-caption text-muted-foreground">
                http://localhost:3001{wh.path}
              </code>
            </div>
          ))}
        </CardContent>
      </Card>

      <Alert variant="info">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Encrypted at rest</AlertTitle>
        <AlertDescription>
          All API keys are encrypted with AES-256-GCM before being stored. Plaintext values are
          never persisted or returned by the API; only a 4-character masked hint is shown for
          identification.
        </AlertDescription>
      </Alert>
    </div>
  );
}
