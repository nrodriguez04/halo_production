export const openclawConfig = {
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://localhost:18789',
  authToken: process.env.OPENCLAW_AUTH_TOKEN || '',
  enabled: process.env.FEATURE_OPENCLAW === 'true',
  agentName: 'halo-worker',
};
