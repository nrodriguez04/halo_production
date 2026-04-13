import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNT_ID = 'halo-hq';

const DEMO_PROPERTIES = [
  { address: '123 Oak St', city: 'Phoenix', state: 'AZ', zip: '85001', lat: 33.4484, lng: -112.074, value: 285000, apn: 'AZ-001-234' },
  { address: '456 Palm Ave', city: 'Tampa', state: 'FL', zip: '33602', lat: 27.9506, lng: -82.4572, value: 320000, apn: 'FL-002-567' },
  { address: '789 Magnolia Dr', city: 'Atlanta', state: 'GA', zip: '30303', lat: 33.749, lng: -84.388, value: 195000, apn: 'GA-003-890' },
  { address: '321 Cypress Ln', city: 'Dallas', state: 'TX', zip: '75201', lat: 32.7767, lng: -96.797, value: 410000, apn: 'TX-004-321' },
  { address: '654 Birch Rd', city: 'Memphis', state: 'TN', zip: '38103', lat: 35.1495, lng: -90.049, value: 155000, apn: 'TN-005-654' },
  { address: '987 Elm St', city: 'Jacksonville', state: 'FL', zip: '32202', lat: 30.3322, lng: -81.6557, value: 245000, apn: 'FL-006-987' },
  { address: '111 Pine Way', city: 'San Antonio', state: 'TX', zip: '78205', lat: 29.4241, lng: -98.4936, value: 275000, apn: 'TX-007-111' },
  { address: '222 Cedar Blvd', city: 'Charlotte', state: 'NC', zip: '28202', lat: 35.2271, lng: -80.8431, value: 340000, apn: 'NC-008-222' },
  { address: '333 Maple Ct', city: 'Indianapolis', state: 'IN', zip: '46204', lat: 39.7684, lng: -86.158, value: 180000, apn: 'IN-009-333' },
  { address: '444 Walnut Pl', city: 'Columbus', state: 'OH', zip: '43215', lat: 39.9612, lng: -82.9988, value: 210000, apn: 'OH-010-444' },
];

const DEMO_BUYERS = [
  { name: 'Marcus Chen', email: 'mchen@example.com', phone: '+15551001001', prefs: { locations: ['Phoenix', 'Tampa'], priceRange: { min: 100000, max: 350000 }, propertyTypes: ['SFH'] } },
  { name: 'Lisa Rodriguez', email: 'lrodriguez@example.com', phone: '+15551001002', prefs: { locations: ['Dallas', 'San Antonio'], priceRange: { min: 200000, max: 500000 }, propertyTypes: ['SFH', 'Multi'] } },
  { name: 'David Kim', email: 'dkim@example.com', phone: '+15551001003', prefs: { locations: ['Atlanta', 'Charlotte'], priceRange: { min: 150000, max: 400000 }, propertyTypes: ['SFH'] } },
  { name: 'Sarah Johnson', email: 'sjohnson@example.com', phone: '+15551001004', prefs: { locations: ['Memphis', 'Jacksonville'], priceRange: { min: 100000, max: 250000 }, propertyTypes: ['SFH', 'Duplex'] } },
  { name: 'Robert Williams', email: 'rwilliams@example.com', phone: '+15551001005', prefs: { locations: ['Columbus', 'Indianapolis'], priceRange: { min: 120000, max: 300000 }, propertyTypes: ['SFH'] } },
];

const DEAL_STAGES = ['new', 'contacted', 'negotiating', 'under_contract', 'marketing', 'assigned', 'closed', 'lost'] as const;

async function main() {
  console.log('Seeding database...\n');

  // 1. Account
  const account = await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: {},
    create: { id: ACCOUNT_ID, name: 'Hālo HQ' },
  });
  console.log(`Account: ${account.name}`);

  // 2. Roles
  const roleNames = [
    { name: 'OWNER', description: 'Full system access' },
    { name: 'ADMIN', description: 'Administrative access' },
    { name: 'OPERATOR', description: 'Operational access' },
    { name: 'VIEWER', description: 'Read-only access' },
  ];
  for (const r of roleNames) {
    await prisma.role.upsert({ where: { name: r.name }, update: {}, create: r });
  }
  console.log(`Roles: ${roleNames.map((r) => r.name).join(', ')}`);

  // 3. Control plane
  await prisma.controlPlane.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      enabled: true,
      smsEnabled: true,
      emailEnabled: true,
      docusignEnabled: true,
      externalDataEnabled: true,
    },
  });
  console.log('Control plane: default');

  // 4. Quiet hours
  await prisma.quietHours.upsert({
    where: { accountId: ACCOUNT_ID },
    update: {},
    create: {
      accountId: ACCOUNT_ID,
      timezone: 'America/Los_Angeles',
      startHour: 20,
      endHour: 9,
      enabled: true,
    },
  });
  console.log('Quiet hours: 8PM-9AM PT');

  // 5. Leads + Properties + Deals
  console.log('\nCreating leads, properties, and deals...');
  const createdDeals: string[] = [];

  for (let i = 0; i < DEMO_PROPERTIES.length; i++) {
    const prop = DEMO_PROPERTIES[i];
    const ownerFirst = ['James', 'Maria', 'William', 'Jennifer', 'Michael', 'Patricia', 'Robert', 'Linda', 'John', 'Elizabeth'][i];
    const ownerLast = ['Smith', 'Garcia', 'Brown', 'Davis', 'Wilson', 'Miller', 'Taylor', 'Anderson', 'Thomas', 'Jackson'][i];

    const lead = await prisma.lead.create({
      data: {
        accountId: ACCOUNT_ID,
        status: i < 3 ? 'new' : i < 6 ? 'enriched' : 'contacted',
        score: 40 + Math.round(Math.random() * 60),
        tags: i % 2 === 0 ? ['motivated', 'pre-foreclosure'] : ['absentee', 'tax-lien'],
        canonicalAddress: prop.address,
        canonicalCity: prop.city,
        canonicalState: prop.state,
        canonicalZip: prop.zip,
        canonicalOwner: `${ownerFirst} ${ownerLast}`,
        canonicalPhone: `+1555${String(2000 + i).padStart(4, '0')}${String(100 + i).padStart(3, '0')}`,
        canonicalEmail: `${ownerFirst.toLowerCase()}.${ownerLast.toLowerCase()}@example.com`,
      },
    });

    const property = await prisma.property.create({
      data: {
        accountId: ACCOUNT_ID,
        leadId: lead.id,
        apn: prop.apn,
        address: prop.address,
        city: prop.city,
        state: prop.state,
        zip: prop.zip,
        latitude: prop.lat,
        longitude: prop.lng,
        estimatedValue: prop.value,
        confidence: 0.7 + Math.random() * 0.3,
      },
    });

    const stageIndex = i % DEAL_STAGES.length;
    const stage = DEAL_STAGES[stageIndex];
    const arv = prop.value * (1.1 + Math.random() * 0.3);
    const repair = prop.value * (0.1 + Math.random() * 0.15);
    const mao = (arv * 0.7) - repair;

    const deal = await prisma.deal.create({
      data: {
        accountId: ACCOUNT_ID,
        leadId: lead.id,
        propertyId: property.id,
        stage,
        arv: Math.round(arv),
        repairEstimate: Math.round(repair),
        mao: Math.round(mao),
        offerAmount: stage === 'new' ? null : Math.round(mao * (0.9 + Math.random() * 0.15)),
      },
    });

    createdDeals.push(deal.id);
    console.log(`  Lead ${i + 1}: ${prop.address}, ${prop.city} ${prop.state} -> Deal stage: ${stage}`);
  }

  // 6. Buyers
  console.log('\nCreating buyers...');
  for (const buyer of DEMO_BUYERS) {
    await prisma.buyer.create({
      data: {
        accountId: ACCOUNT_ID,
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
        preferences: buyer.prefs,
        engagementScore: Math.round(Math.random() * 100) / 10,
      },
    });
    console.log(`  Buyer: ${buyer.name}`);
  }

  // 7. Sample messages
  console.log('\nCreating sample messages...');
  const messageTemplates = [
    { channel: 'sms', direction: 'outbound', status: 'sent', content: 'Hi, we noticed your property at {address}. Would you consider a cash offer?' },
    { channel: 'email', direction: 'outbound', status: 'pending_approval', content: 'Subject: Cash Offer for Your Property\n\nHello,\n\nWe are interested in making a cash offer on your property. Would you be open to a brief conversation?' },
    { channel: 'sms', direction: 'inbound', status: 'delivered', content: 'Yes, I would be interested. What kind of offer are you thinking?' },
    { channel: 'sms', direction: 'outbound', status: 'approved', content: 'Great! Based on our analysis, we are prepared to offer in the range of ${mao}. Can we schedule a call to discuss?' },
  ];

  for (let i = 0; i < 4 && i < createdDeals.length; i++) {
    const tmpl = messageTemplates[i];
    await prisma.message.create({
      data: {
        accountId: ACCOUNT_ID,
        dealId: createdDeals[i],
        channel: tmpl.channel,
        direction: tmpl.direction,
        status: tmpl.status,
        content: tmpl.content.replace('{address}', DEMO_PROPERTIES[i].address),
      },
    });
  }
  console.log(`  Created ${Math.min(4, createdDeals.length)} sample messages`);

  // 8. Consent records
  console.log('\nCreating consent records...');
  const leads = await prisma.lead.findMany({ where: { accountId: ACCOUNT_ID }, take: 5 });
  for (const lead of leads) {
    if (lead.canonicalPhone) {
      await prisma.consent.create({
        data: {
          accountId: ACCOUNT_ID,
          leadId: lead.id,
          phone: lead.canonicalPhone,
          channel: 'sms',
          source: 'form',
          evidence: { type: 'web_form', timestamp: new Date().toISOString() },
        },
      });
    }
  }
  console.log(`  Created ${leads.length} consent records`);

  // 9. Timeline events for deals
  console.log('\nCreating timeline events...');
  let eventCount = 0;
  for (const dealId of createdDeals.slice(0, 5)) {
    await prisma.timelineEvent.create({
      data: {
        tenantId: ACCOUNT_ID,
        entityType: 'DEAL',
        entityId: dealId,
        eventType: 'DEAL_CREATED',
        payloadJson: { source: 'seed' },
        actorType: 'system',
      },
    });
    eventCount++;
  }
  console.log(`  Created ${eventCount} timeline events`);

  console.log('\n--- Seed complete! ---');
  console.log(`\nSummary:`);
  console.log(`  Account:    1 (${ACCOUNT_ID})`);
  console.log(`  Roles:      ${roleNames.length}`);
  console.log(`  Leads:      ${DEMO_PROPERTIES.length}`);
  console.log(`  Properties: ${DEMO_PROPERTIES.length}`);
  console.log(`  Deals:      ${DEMO_PROPERTIES.length}`);
  console.log(`  Buyers:     ${DEMO_BUYERS.length}`);
  console.log(`  Messages:   ${Math.min(4, createdDeals.length)}`);
  console.log(`  Consents:   ${leads.length}`);
  console.log(`  Timeline:   ${eventCount}`);
  console.log(`\nRun "npm run db:studio" to explore data in Prisma Studio.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
