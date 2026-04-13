/**
 * Valuation Eval Script
 *
 * Measures underwriting ARV accuracy against known sale prices.
 * Usage: EVAL_API_URL=http://localhost:3001/api EVAL_TOKEN=<token> npx tsx scripts/valuation-eval.ts
 */

const API_URL = process.env.EVAL_API_URL || 'http://localhost:3001/api';
const TOKEN = process.env.EVAL_TOKEN || '';

interface EvalProperty {
  address: string;
  city: string;
  state: string;
  knownSalePrice: number;
}

const EVAL_SET: EvalProperty[] = [
  { address: '123 Main St', city: 'Houston', state: 'TX', knownSalePrice: 185000 },
  { address: '456 Oak Ave', city: 'Dallas', state: 'TX', knownSalePrice: 220000 },
  { address: '789 Pine Rd', city: 'San Antonio', state: 'TX', knownSalePrice: 165000 },
  { address: '321 Elm Blvd', city: 'Austin', state: 'TX', knownSalePrice: 310000 },
  { address: '654 Cedar Ln', city: 'Fort Worth', state: 'TX', knownSalePrice: 195000 },
  { address: '111 Birch Way', city: 'Phoenix', state: 'AZ', knownSalePrice: 275000 },
  { address: '222 Maple Dr', city: 'Tucson', state: 'AZ', knownSalePrice: 210000 },
  { address: '333 Walnut St', city: 'Mesa', state: 'AZ', knownSalePrice: 235000 },
  { address: '444 Cherry Ct', city: 'Atlanta', state: 'GA', knownSalePrice: 260000 },
  { address: '555 Spruce Ave', city: 'Savannah', state: 'GA', knownSalePrice: 195000 },
  { address: '666 Ash Pl', city: 'Jacksonville', state: 'FL', knownSalePrice: 225000 },
  { address: '777 Poplar Rd', city: 'Tampa', state: 'FL', knownSalePrice: 290000 },
  { address: '888 Willow Ln', city: 'Orlando', state: 'FL', knownSalePrice: 255000 },
  { address: '999 Cypress Dr', city: 'Miami', state: 'FL', knownSalePrice: 380000 },
  { address: '100 Hickory St', city: 'Charlotte', state: 'NC', knownSalePrice: 240000 },
  { address: '200 Magnolia Ave', city: 'Raleigh', state: 'NC', knownSalePrice: 270000 },
  { address: '300 Dogwood Blvd', city: 'Nashville', state: 'TN', knownSalePrice: 285000 },
  { address: '400 Redwood Ct', city: 'Memphis', state: 'TN', knownSalePrice: 175000 },
  { address: '500 Sequoia Way', city: 'Indianapolis', state: 'IN', knownSalePrice: 195000 },
  { address: '600 Juniper Dr', city: 'Columbus', state: 'OH', knownSalePrice: 210000 },
  { address: '700 Beech Rd', city: 'Cleveland', state: 'OH', knownSalePrice: 165000 },
  { address: '800 Sycamore Ln', city: 'Kansas City', state: 'MO', knownSalePrice: 185000 },
  { address: '900 Chestnut St', city: 'St Louis', state: 'MO', knownSalePrice: 170000 },
  { address: '1000 Linden Ave', city: 'Denver', state: 'CO', knownSalePrice: 350000 },
  { address: '1100 Palm Blvd', city: 'Las Vegas', state: 'NV', knownSalePrice: 295000 },
];

interface EvalResult {
  address: string;
  knownPrice: number;
  arvEstimate: number | null;
  error: number | null;
  errorPct: number | null;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(init.headers || {}),
    },
  });
}

async function runEval() {
  console.log(`\nValuation Eval Script`);
  console.log(`API: ${API_URL}`);
  console.log(`Properties: ${EVAL_SET.length}\n`);

  const results: EvalResult[] = [];

  for (const prop of EVAL_SET) {
    try {
      const leadRes = await apiFetch('/leads', {
        method: 'POST',
        body: JSON.stringify({
          rawAddress: prop.address,
          rawCity: prop.city,
          rawState: prop.state,
          source: 'valuation-eval',
        }),
      });

      if (!leadRes.ok) {
        results.push({ address: prop.address, knownPrice: prop.knownSalePrice, arvEstimate: null, error: null, errorPct: null });
        continue;
      }

      const lead = await leadRes.json();

      const dealRes = await apiFetch('/deals', {
        method: 'POST',
        body: JSON.stringify({ leadId: lead.id }),
      });

      if (!dealRes.ok) {
        results.push({ address: prop.address, knownPrice: prop.knownSalePrice, arvEstimate: null, error: null, errorPct: null });
        continue;
      }

      const deal = await dealRes.json();

      const uwRes = await apiFetch(`/underwriting/analyze/${deal.id}`, { method: 'POST' });
      if (!uwRes.ok) {
        results.push({ address: prop.address, knownPrice: prop.knownSalePrice, arvEstimate: null, error: null, errorPct: null });
        continue;
      }

      // Poll for result
      await new Promise((r) => setTimeout(r, 3000));

      const resultRes = await apiFetch(`/underwriting/result/${deal.id}`);
      const result = resultRes.ok ? await resultRes.json() : null;
      const arv = result?.arv || result?.resultJson?.arv || null;

      const absError = arv ? Math.abs(arv - prop.knownSalePrice) : null;
      const pctError = arv ? (absError! / prop.knownSalePrice) * 100 : null;

      results.push({ address: prop.address, knownPrice: prop.knownSalePrice, arvEstimate: arv, error: absError, errorPct: pctError });

      console.log(`  ${prop.address}: known=$${prop.knownSalePrice.toLocaleString()}, arv=${arv ? '$' + arv.toLocaleString() : 'N/A'}, error=${pctError ? pctError.toFixed(1) + '%' : 'N/A'}`);
    } catch (err: any) {
      console.error(`  ${prop.address}: FAILED - ${err.message}`);
      results.push({ address: prop.address, knownPrice: prop.knownSalePrice, arvEstimate: null, error: null, errorPct: null });
    }
  }

  // Summary
  const withEstimates = results.filter((r) => r.error !== null);
  const errors = withEstimates.map((r) => r.error!);
  const pctErrors = withEstimates.map((r) => r.errorPct!);

  console.log('\n--- Summary ---');
  console.log(`Total properties: ${results.length}`);
  console.log(`With estimates: ${withEstimates.length}`);
  console.log(`No estimate: ${results.length - withEstimates.length}`);

  if (errors.length > 0) {
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    const medianError = errors.sort((a, b) => a - b)[Math.floor(errors.length / 2)];
    const meanPctError = pctErrors.reduce((a, b) => a + b, 0) / pctErrors.length;

    console.log(`Mean Absolute Error: $${meanError.toFixed(0)}`);
    console.log(`Median Absolute Error: $${medianError.toFixed(0)}`);
    console.log(`Mean % Error: ${meanPctError.toFixed(1)}%`);
  }

  // CSV output
  console.log('\n--- CSV ---');
  console.log('address,known_price,arv_estimate,abs_error,pct_error');
  for (const r of results) {
    console.log(`"${r.address}",${r.knownPrice},${r.arvEstimate || ''},${r.error || ''},${r.errorPct?.toFixed(1) || ''}`);
  }
}

runEval().catch(console.error);
