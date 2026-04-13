'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

interface IntegrationStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  envHint: string;
  lastCheck?: string;
}

const INTEGRATIONS: { name: string; envHint: string }[] = [
  { name: 'Twilio', envHint: 'TWILIO_ACCOUNT_SID' },
  { name: 'DocuSign', envHint: 'DOCUSIGN_CLIENT_ID' },
  { name: 'ATTOM Property API', envHint: 'ATTOM_API_KEY' },
  { name: 'Google Geocoding', envHint: 'GOOGLE_GEOCODING_API_KEY' },
  { name: 'OpenAI', envHint: 'OPENAI_API_KEY' },
  { name: 'SendGrid', envHint: 'SENDGRID_API_KEY' },
  { name: 'RentCast', envHint: 'RENTCAST_API_KEY' },
  { name: 'OpenClaw', envHint: 'OPENCLAW_ENABLED' },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkIntegrations();
  }, []);

  const checkIntegrations = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/health');
      const health = await res.json();

      const statuses: IntegrationStatus[] = INTEGRATIONS.map((int) => {
        const isHealthy =
          health?.status === 'ok' &&
          health?.database?.status === 'ok' &&
          health?.redis?.status === 'ok';

        return {
          name: int.name,
          envHint: int.envHint,
          status: isHealthy ? 'disconnected' : 'disconnected',
          lastCheck: new Date().toISOString(),
        };
      });

      setIntegrations(statuses);
    } catch {
      setIntegrations(
        INTEGRATIONS.map((int) => ({
          name: int.name,
          envHint: int.envHint,
          status: 'error' as const,
          lastCheck: new Date().toISOString(),
        })),
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading integrations...
      </div>
    );
  }

  const statusBadge = (s: string) => {
    if (s === 'connected') return 'success' as const;
    if (s === 'error') return 'destructive' as const;
    return 'secondary' as const;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor external service connections
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={checkIntegrations}>
          <RefreshCw size={16} className="mr-2" />
          Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((int) => (
          <Card key={int.name}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-foreground">
                  {int.name}
                </CardTitle>
                <Badge variant={statusBadge(int.status)}>
                  {int.status === 'connected'
                    ? 'Connected'
                    : int.status === 'error'
                      ? 'Error'
                      : 'Not Connected'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {int.lastCheck && (
                <p className="text-xs text-muted-foreground">
                  Last checked: {new Date(int.lastCheck).toLocaleString()}
                </p>
              )}
              {int.status !== 'connected' && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">
                    Configure in API environment:
                  </p>
                  <code className="block text-xs bg-secondary px-2 py-1 rounded text-foreground">
                    {int.envHint}=your_key
                  </code>
                </div>
              )}
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
    </div>
  );
}
