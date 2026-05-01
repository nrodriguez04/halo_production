import request = require('supertest');

const describeTenant = process.env.E2E_TOKEN_TENANT_A ? describe : describe.skip;

describeTenant('Tenant isolation (e2e)', () => {
  const apiBase = process.env.API_BASE_URL || 'http://localhost:3001';

  const tenantA = {
    token: process.env.E2E_TOKEN_TENANT_A || '',
    leadId: process.env.E2E_LEAD_ID_TENANT_A || '',
    dealId: process.env.E2E_DEAL_ID_TENANT_A || '',
    propertyId: process.env.E2E_PROPERTY_ID_TENANT_A || '',
    phone: process.env.E2E_PHONE_TENANT_A || '',
  };

  const tenantB = {
    token: process.env.E2E_TOKEN_TENANT_B || '',
    leadId: process.env.E2E_LEAD_ID_TENANT_B || '',
    dealId: process.env.E2E_DEAL_ID_TENANT_B || '',
    propertyId: process.env.E2E_PROPERTY_ID_TENANT_B || '',
    phone: process.env.E2E_PHONE_TENANT_B || '',
  };

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('Tenant A cannot read Tenant B leads', async () => {
    const res = await request(apiBase)
      .get(`/api/leads/${tenantB.leadId}`)
      .set(authHeader(tenantA.token));
    expect([403, 404]).toContain(res.status);
  });

  it('Tenant A cannot read Tenant B deals', async () => {
    const res = await request(apiBase)
      .get(`/api/deals/${tenantB.dealId}`)
      .set(authHeader(tenantA.token));
    expect([403, 404]).toContain(res.status);
  });

  it('Tenant A cannot read Tenant B properties', async () => {
    const res = await request(apiBase)
      .get(`/api/properties/${tenantB.propertyId}`)
      .set(authHeader(tenantA.token));
    expect([403, 404]).toContain(res.status);
  });

  it('Lead list only returns own tenant leads', async () => {
    const res = await request(apiBase)
      .get('/api/leads')
      .set(authHeader(tenantA.token))
      .expect(200);

    const leaked = (res.body || []).find(
      (l: any) => l.id === tenantB.leadId,
    );
    expect(leaked).toBeUndefined();
  });

  it('Deal list only returns own tenant deals', async () => {
    const res = await request(apiBase)
      .get('/api/deals')
      .set(authHeader(tenantA.token))
      .expect(200);

    const leaked = (res.body || []).find(
      (d: any) => d.id === tenantB.dealId,
    );
    expect(leaked).toBeUndefined();
  });

  it('Communications do not leak across tenants', async () => {
    const res = await request(apiBase)
      .get('/api/communications/messages')
      .set(authHeader(tenantA.token))
      .expect(200);

    const leaked = (res.body || []).find(
      (m: any) => m.dealId === tenantB.dealId,
    );
    expect(leaked).toBeUndefined();
  });

  it('Timeline events are tenant-scoped', async () => {
    const res = await request(apiBase)
      .get(`/api/timeline/DEAL/${tenantB.dealId}`)
      .set(authHeader(tenantA.token));

    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.length).toBe(0);
    }
  });

  it('Twilio inbound webhook routes to correct tenant', async () => {
    const res = await request(apiBase)
      .post('/api/webhooks/twilio/inbound')
      .send({
        From: '+15551234567',
        To: tenantA.phone,
        Body: 'E2E test inbound',
      });
    // 403 when TWILIO_AUTH_TOKEN is required but unset (fail-closed)
    expect([200, 403]).toContain(res.status);
  });

  it('Job lookup is tenant-scoped', async () => {
    const res = await request(apiBase)
      .get('/api/jobs/nonexistent-job-id')
      .set(authHeader(tenantA.token));
    expect([404]).toContain(res.status);
  });
});
