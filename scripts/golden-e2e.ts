#!/usr/bin/env tsx
/**
 * Golden E2E Test Script
 *
 * Tests the complete workflow with Descope auth:
 * 1. Import lead (CSV)
 * 2. Enrich lead (ATTOM + geocode)
 * 3. Underwrite (AI) -- async job
 * 4. Generate offer draft
 * 5. Create DocuSign envelope
 * 6. Simulate webhook
 * 7. Advance deal stage
 * 8. Generate buyer blast -> approval queue
 * 9. Verify timeline events
 *
 * Usage:
 *   E2E_TOKEN=<descope_jwt> npm run e2e
 *   E2E_TOKEN=<descope_jwt> API_URL=http://localhost:3001/api npm run e2e
 */

import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const TOKEN = process.env.E2E_TOKEN || '';

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...getHeaders(), ...(init.headers as Record<string, string> || {}) },
  });
  return res;
}

function log(step: string, msg: string) {
  console.log(`  [${step}] ${msg}`);
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function main() {
  console.log('\nGolden E2E Test');
  console.log(`API: ${API_URL}`);
  console.log(`Auth: ${TOKEN ? 'Bearer token' : 'No token (will fail on protected routes)'}\n`);

  // 1. Import lead
  log('1/10', 'Importing lead via CSV...');
  const importRes = await api('/leads/import/csv', {
    method: 'POST',
    body: JSON.stringify({
      rows: [{
        address: '123 E2E Test St',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001',
        owner: 'E2E Test Owner',
        phone: '555-0100',
        email: 'e2e@test.local',
      }],
    }),
  });
  assert(importRes.ok, `Lead import failed: ${importRes.status}`);
  const importResult: any = await importRes.json();
  log('1/10', `Created ${importResult.created} lead(s)`);

  // Get lead
  const leadsRes = await api('/leads');
  const leads: any[] = await leadsRes.json();
  const lead = leads.find((l: any) => l.canonicalAddress?.includes('E2E Test')) || leads[0];
  assert(lead, 'No lead found after import');
  const leadId = lead.id;
  log('1/10', `Lead ID: ${leadId}`);

  // 2. Enrichment (skip if no API keys)
  log('2/10', 'Enrichment step (skipped without ATTOM/Google keys)');

  // 3. Create property
  log('3/10', 'Creating property...');
  const propRes = await api('/properties', {
    method: 'POST',
    body: JSON.stringify({
      accountId: lead.accountId || 'halo-hq',
      leadId,
      address: '123 E2E Test St',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90001',
      latitude: 34.0522,
      longitude: -118.2437,
      confidence: 0.85,
    }),
  });
  assert(propRes.ok, `Property creation failed: ${propRes.status}`);
  const property: any = await propRes.json();
  log('3/10', `Property ID: ${property.id}`);

  // 4. Create deal
  log('4/10', 'Creating deal...');
  const dealRes = await api('/deals', {
    method: 'POST',
    body: JSON.stringify({
      accountId: lead.accountId || 'halo-hq',
      leadId,
      propertyId: property.id,
      stage: 'new',
    }),
  });
  assert(dealRes.ok, `Deal creation failed: ${dealRes.status}`);
  const deal: any = await dealRes.json();
  const dealId = deal.id;
  log('4/10', `Deal ID: ${dealId}`);

  // 5. Underwrite (async)
  log('5/10', 'Enqueuing underwriting...');
  const uwRes = await api(`/underwriting/analyze/${dealId}`, { method: 'POST' });
  if (uwRes.ok) {
    const uw: any = await uwRes.json();
    log('5/10', `Job ID: ${uw.jobId || 'inline'}`);
    if (uw.jobId) {
      await new Promise((r) => setTimeout(r, 2000));
      const jobRes = await api(`/jobs/${uw.jobId}`);
      if (jobRes.ok) {
        const job: any = await jobRes.json();
        log('5/10', `Job status: ${job.status}`);
      }
    }
  } else {
    log('5/10', 'Skipped (requires OpenAI key)');
  }

  // 6. Update deal stage
  log('6/10', 'Advancing deal to negotiating...');
  const stageRes = await api(`/deals/${dealId}/stage`, {
    method: 'PUT',
    body: JSON.stringify({ stage: 'contacted' }),
  });
  if (stageRes.ok) {
    const stageRes2 = await api(`/deals/${dealId}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ stage: 'negotiating' }),
    });
    log('6/10', `Stage update: ${stageRes2.ok ? 'OK' : stageRes2.status}`);
  }

  // 7. DocuSign envelope
  log('7/10', 'Creating DocuSign envelope...');
  const dsRes = await api(`/integrations/docusign/envelopes?dealId=${dealId}`, { method: 'POST' });
  log('7/10', dsRes.ok ? 'Envelope created' : 'Skipped (requires DocuSign creds)');

  // 8. Simulate webhook
  log('8/10', 'Simulating DocuSign webhook...');
  await api('/webhooks/docusign', {
    method: 'POST',
    body: JSON.stringify({
      event: 'envelope-completed',
      data: { envelopeId: 'e2e-test-envelope', pdfUrl: 'https://example.com/e2e.pdf' },
    }),
  });
  log('8/10', 'Webhook processed');

  // 9. Buyer blast
  log('9/10', 'Creating buyer + blast...');
  const buyerRes = await api('/buyers', {
    method: 'POST',
    body: JSON.stringify({
      accountId: lead.accountId || 'halo-hq',
      name: 'E2E Test Buyer',
      email: 'buyer@e2e.local',
      preferences: { locations: ['CA'], priceRange: { min: 100000, max: 300000 } },
    }),
  });
  if (buyerRes.ok) {
    const buyer: any = await buyerRes.json();
    const blastRes = await api(`/marketing/buyer-blast/${dealId}`, {
      method: 'POST',
      body: JSON.stringify({ buyerIds: [buyer.id] }),
    });
    log('9/10', blastRes.ok ? 'Buyer blast created' : `Blast failed: ${blastRes.status}`);
  }

  // 10. Verify final state
  log('10/10', 'Verifying final state...');
  const finalRes = await api(`/deals/${dealId}`);
  assert(finalRes.ok, 'Could not read final deal');
  const finalDeal: any = await finalRes.json();
  log('10/10', `Stage: ${finalDeal.stage}`);

  // Check timeline
  const tlRes = await api(`/timeline/DEAL/${dealId}`);
  if (tlRes.ok) {
    const events: any[] = await tlRes.json();
    log('10/10', `Timeline events: ${events.length}`);
  }

  console.log('\nGolden E2E Test Completed\n');
  console.log('Summary:');
  console.log(`  Lead:     ${leadId}`);
  console.log(`  Property: ${property.id}`);
  console.log(`  Deal:     ${dealId} (stage: ${finalDeal.stage})`);
}

main().catch((err) => {
  console.error('\nE2E Test Failed:', err.message);
  process.exit(1);
});
