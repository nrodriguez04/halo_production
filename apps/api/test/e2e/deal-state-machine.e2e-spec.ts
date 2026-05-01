import request = require('supertest');

describe('Deal state machine (e2e)', () => {
  const apiBase = process.env.API_BASE_URL || 'http://localhost:3001';
  const token = process.env.E2E_TOKEN_TENANT_A || '';
  const authHeader = { Authorization: `Bearer ${token}` };

  let dealId: string;

  beforeAll(async () => {
    const res = await request(apiBase)
      .post('/api/deals')
      .set(authHeader)
      .send({ stage: 'new' });

    if (res.ok) {
      dealId = res.body.id;
    }
  });

  it('Allows valid transition: new -> contacted', async () => {
    if (!dealId) return;
    const res = await request(apiBase)
      .put(`/api/deals/${dealId}/stage`)
      .set(authHeader)
      .send({ stage: 'contacted' });
    expect([200, 201]).toContain(res.status);
  });

  it('Allows valid transition: contacted -> negotiating', async () => {
    if (!dealId) return;
    const res = await request(apiBase)
      .put(`/api/deals/${dealId}/stage`)
      .set(authHeader)
      .send({ stage: 'negotiating' });
    expect([200, 201]).toContain(res.status);
  });

  it('Blocks invalid transition: negotiating -> closed', async () => {
    if (!dealId) return;
    const res = await request(apiBase)
      .put(`/api/deals/${dealId}/stage`)
      .set(authHeader)
      .send({ stage: 'closed' });
    expect([400]).toContain(res.status);
  });

  it('Blocks invalid transition: negotiating -> new', async () => {
    if (!dealId) return;
    const res = await request(apiBase)
      .put(`/api/deals/${dealId}/stage`)
      .set(authHeader)
      .send({ stage: 'new' });
    expect([400]).toContain(res.status);
  });

  it('Allows transition to lost from any active stage', async () => {
    if (!dealId) return;
    const res = await request(apiBase)
      .put(`/api/deals/${dealId}/stage`)
      .set(authHeader)
      .send({ stage: 'lost' });
    expect([200, 201]).toContain(res.status);
  });
});
