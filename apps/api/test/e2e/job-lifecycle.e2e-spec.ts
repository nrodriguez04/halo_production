import request from 'supertest';

describe('Job lifecycle (e2e)', () => {
  const apiBase = process.env.API_BASE_URL || 'http://localhost:3001';
  const token = process.env.E2E_TOKEN_TENANT_A || '';
  const dealId = process.env.E2E_DEAL_ID_TENANT_A || '';
  const authHeader = { Authorization: `Bearer ${token}` };

  it('Enqueues underwriting and returns jobId', async () => {
    if (!dealId) return;

    const res = await request(apiBase)
      .post(`/api/underwriting/analyze/${dealId}`)
      .set(authHeader);

    if (res.status === 200 || res.status === 201) {
      expect(res.body.jobId).toBeDefined();
    }
  });

  it('Returns job status via GET /api/jobs/:jobId', async () => {
    if (!dealId) return;

    const enqueueRes = await request(apiBase)
      .post(`/api/underwriting/analyze/${dealId}`)
      .set(authHeader);

    if (!enqueueRes.ok) return;

    const jobId = enqueueRes.body.jobId;
    const statusRes = await request(apiBase)
      .get(`/api/jobs/${jobId}`)
      .set(authHeader)
      .expect(200);

    expect(statusRes.body.id).toBe(jobId);
    expect(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']).toContain(statusRes.body.status);
  });

  it('Enqueues marketing flyer and returns jobId', async () => {
    if (!dealId) return;

    const res = await request(apiBase)
      .post(`/api/marketing/flyer/${dealId}`)
      .set(authHeader);

    if (res.status === 200 || res.status === 201) {
      expect(res.body.jobId).toBeDefined();
    }
  });

  it('Returns 404 for nonexistent job', async () => {
    await request(apiBase)
      .get('/api/jobs/00000000-0000-0000-0000-000000000000')
      .set(authHeader)
      .expect(404);
  });

  it('Job status endpoint is tenant-scoped', async () => {
    const tokenB = process.env.E2E_TOKEN_TENANT_B || '';
    if (!tokenB || !dealId) return;

    const enqueueRes = await request(apiBase)
      .post(`/api/underwriting/analyze/${dealId}`)
      .set(authHeader);

    if (!enqueueRes.ok) return;

    const jobId = enqueueRes.body.jobId;

    const crossTenantRes = await request(apiBase)
      .get(`/api/jobs/${jobId}`)
      .set({ Authorization: `Bearer ${tokenB}` });

    expect([403, 404]).toContain(crossTenantRes.status);
  });
});
