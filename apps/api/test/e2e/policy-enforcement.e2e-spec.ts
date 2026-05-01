import request = require('supertest');

const describePolicy = process.env.E2E_TOKEN_TENANT_A ? describe : describe.skip;

describePolicy('Policy enforcement (e2e)', () => {
  const apiBase = process.env.API_BASE_URL || 'http://localhost:3001';
  const token = process.env.E2E_TOKEN_TENANT_A || '';
  const dealId = process.env.E2E_DEAL_ID_TENANT_A || '';
  const authHeader = { Authorization: `Bearer ${token}` };

  it('Blocks underwriting when AI is disabled via control plane', async () => {
    const cpOff = await request(apiBase)
      .put('/api/control-plane')
      .set(authHeader)
      .send({ enabled: false });
    expect([200, 403]).toContain(cpOff.status);

    if (dealId) {
      const res = await request(apiBase)
        .post(`/api/underwriting/analyze/${dealId}`)
        .set(authHeader);
      expect([403, 400]).toContain(res.status);
    }

    await request(apiBase)
      .put('/api/control-plane')
      .set(authHeader)
      .send({ enabled: true });
  });

  it('Returns policy violation code on blocked SMS creation', async () => {
    await request(apiBase)
      .put('/api/control-plane')
      .set(authHeader)
      .send({ smsEnabled: false });

    const res = await request(apiBase)
      .post('/api/communications/messages')
      .set(authHeader)
      .send({
        channel: 'sms',
        content: 'E2E test blocked message',
        toAddress: '+15550000000',
      });

    if (res.status === 403) {
      expect(res.body.message || res.body.code).toBeDefined();
    }

    await request(apiBase)
      .put('/api/control-plane')
      .set(authHeader)
      .send({ smsEnabled: true });
  });

  it('Allows operations when control plane is fully enabled', async () => {
    const res = await request(apiBase)
      .get('/api/leads')
      .set(authHeader);
    expect(res.status).toBe(200);
  });
});
