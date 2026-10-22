import { fillTemplate, formatDate, formatMoney, templatePlaceholders } from './agreement-templates';

const TEMPLATE = `SYNTHETIC PURCHASE AGREEMENT
Seller: {{seller_name}}   Buyer: {{ buyer_entity }}
Property: {{property_address}}, {{property_city}}, {{property_state}} {{property_zip}}
Price: {{purchase_price}}. Earnest money {{earnest_money}} due {{earnest_money_due}}.
Close by {{closing_deadline}}. Buyer may assign this agreement.
[SELLER_SIGNATURE] [SELLER_DATE]`;

const values = {
  seller_name: 'SYNTHETIC Seller',
  buyer_entity: 'SYNTHETIC Acquisitions LLC',
  property_address: '100 Synthetic Ave',
  property_city: 'Atlanta',
  property_state: 'GA',
  property_zip: '30310',
  purchase_price: '$120,000.00',
  earnest_money: '$1,000.00',
  earnest_money_due: 'October 24, 2026',
  closing_deadline: 'November 20, 2026',
};

describe('agreement templates', () => {
  it('lists placeholders once, in order, tolerating spaces', () => {
    expect(templatePlaceholders(TEMPLATE)).toEqual([
      'seller_name',
      'buyer_entity',
      'property_address',
      'property_city',
      'property_state',
      'property_zip',
      'purchase_price',
      'earnest_money',
      'earnest_money_due',
      'closing_deadline',
    ]);
  });

  it('fills every blank and leaves the wording and signature anchors alone', () => {
    const out = fillTemplate('purchase_agreement', TEMPLATE, values);
    expect(out.unknown).toEqual([]);
    expect(out.missing).toEqual([]);
    expect(out.text).toContain('Seller: SYNTHETIC Seller   Buyer: SYNTHETIC Acquisitions LLC');
    expect(out.text).toContain('Price: $120,000.00.');
    expect(out.text).toContain('[SELLER_SIGNATURE] [SELLER_DATE]');
    expect(out.text).not.toMatch(/\{\{/);
  });

  it('refuses to fill anything when a value is missing or a field is unknown', () => {
    const missing = fillTemplate('purchase_agreement', TEMPLATE, { ...values, earnest_money_due: null });
    expect(missing.missing).toEqual(['earnest_money_due']);
    expect(missing.text).toContain('{{earnest_money_due}}');
    const unknown = fillTemplate('purchase_agreement', `${TEMPLATE} {{seller_ssn}}`, values);
    expect(unknown.unknown).toEqual(['seller_ssn']);
  });

  it('keeps purchase and assignment fields apart', () => {
    expect(fillTemplate('assignment', 'Fee {{assignment_fee}}', {}).missing).toEqual(['assignment_fee']);
    expect(fillTemplate('purchase_agreement', 'Fee {{assignment_fee}}', {}).unknown).toEqual(['assignment_fee']);
  });

  it('formats money and dates for a contract', () => {
    expect(formatMoney(120000)).toBe('$120,000.00');
    expect(formatDate(new Date('2026-11-20T12:00:00Z'))).toBe('November 20, 2026');
    expect(formatMoney(null)).toBeNull();
  });
});
