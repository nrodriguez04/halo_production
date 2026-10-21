import {
  closingReadiness,
  isRevenueRealized,
  milestoneDueDate,
  milestoneTemplate,
  type ReadinessMilestone,
} from './closing';
import { canTransitionOffer } from './types';

const NOW = new Date('2026-10-21T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe('milestoneTemplate', () => {
  it('differs for an assignment and a double close', () => {
    const a = milestoneTemplate('assignment').map((m) => m.key);
    const d = milestoneTemplate('double_close').map((m) => m.key);
    expect(a).toContain('assignment_executed');
    expect(a).not.toContain('transactional_funding');
    expect(d).toContain('transactional_funding');
    expect(d).not.toContain('assignment_executed');
    expect(new Set(a).size).toBe(a.length);
    expect(new Set(d).size).toBe(d.length);
  });

  it('dates milestones from the events they depend on', () => {
    const t = milestoneTemplate('assignment');
    const by = (k: string) => t.find((m) => m.key === k)!;
    const dates = { fileOpenedAt: NOW, assignmentExecutedAt: null, closingDate: days(20) };
    expect(milestoneDueDate(by('title_opened'), dates)).toEqual(days(2));
    expect(milestoneDueDate(by('buyer_emd_received'), dates)).toBeNull();
    expect(milestoneDueDate(by('buyer_emd_received'), { ...dates, assignmentExecutedAt: days(1) })).toEqual(days(3));
    expect(milestoneDueDate(by('title_clear'), dates)).toEqual(days(17));
    expect(milestoneDueDate(by('assignment_executed'), dates)).toBeNull();
  });
});

describe('closingReadiness', () => {
  const m = (over: Partial<ReadinessMilestone>): ReadinessMilestone => ({
    key: 'k',
    label: 'Label',
    status: 'pending',
    blocking: true,
    dueAt: null,
    ...over,
  });

  it('is clear to close when every blocking milestone is done or waived and no issue is open', () => {
    const r = closingReadiness({
      now: NOW,
      milestones: [m({ status: 'done' }), m({ status: 'waived' }), m({ blocking: false })],
      issues: [{ kind: 'title', severity: 'warning', description: 'Survey pending', open: true }],
      contractDeadline: days(20),
      scheduledClosingAt: days(10),
    });
    expect(r.clearToClose).toBe(true);
    expect(r.attention).toEqual([{ level: 'warning', text: 'title: Survey pending' }]);
  });

  it('is blocked by a title blocker and reports overdue and imminent milestones', () => {
    const r = closingReadiness({
      now: NOW,
      milestones: [
        m({ key: 'buyer_emd_received', label: 'Buyer deposit', dueAt: days(-1) }),
        m({ key: 'title_clear', label: 'Title clear', dueAt: days(1) }),
      ],
      issues: [{ kind: 'title', severity: 'blocking', description: 'Open mortgage lien', open: true }],
      contractDeadline: days(20),
      scheduledClosingAt: null,
    });
    expect(r.clearToClose).toBe(false);
    expect(r.blockers).toEqual(['Buyer deposit', 'Title clear', 'title issue: Open mortgage lien']);
    expect(r.attention.map((a) => a.level)).toEqual(['overdue', 'due_soon', 'blocked']);
  });

  it('blocks a closing scheduled after the contract deadline, and an expired contract', () => {
    expect(
      closingReadiness({ now: NOW, milestones: [], issues: [], contractDeadline: days(5), scheduledClosingAt: days(7) }).blockers,
    ).toEqual(['Closing is scheduled after the seller contract deadline']);
    expect(
      closingReadiness({ now: NOW, milestones: [], issues: [], contractDeadline: days(-1), scheduledClosingAt: null }).clearToClose,
    ).toBe(false);
  });
});

describe('isRevenueRealized', () => {
  const closed = { closedAt: days(-1), feeReceivedAt: null, realizedFee: 12_000 };
  it('waits for the money under on_funds_received', () => {
    expect(isRevenueRealized('on_funds_received', closed)).toBe(false);
    expect(isRevenueRealized('on_funds_received', { ...closed, feeReceivedAt: days(0) })).toBe(true);
  });
  it('recognizes at a confirmed closing under on_closing_confirmed', () => {
    expect(isRevenueRealized('on_closing_confirmed', closed)).toBe(true);
  });
  it('is never realized without an amount', () => {
    expect(isRevenueRealized('on_closing_confirmed', { ...closed, realizedFee: null })).toBe(false);
  });
});

describe('offer transitions', () => {
  it('lets an accepted offer fall through but never reopens a rejected one', () => {
    expect(canTransitionOffer('received', 'accepted')).toBe(true);
    expect(canTransitionOffer('accepted', 'withdrawn')).toBe(true);
    expect(canTransitionOffer('rejected', 'accepted')).toBe(false);
    expect(canTransitionOffer('accepted', 'received')).toBe(false);
  });
});
