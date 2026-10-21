import type {
  DealStructure,
  IssueSeverity,
  MilestoneStatus,
  RevenueRecognitionRule,
} from './types';

/**
 * Transaction coordination after a buyer is chosen: the milestones a closing
 * file tracks, when it is clear to close, and when the fee counts as
 * revenue. Pure functions; the api stores the milestones and calls these to
 * judge them.
 */

export interface MilestoneTemplate {
  key: string;
  label: string;
  /** Closing cannot be confirmed while a blocking milestone is pending. */
  blocking: boolean;
  /** What the due date is counted from, when it has one. */
  dueFrom?: 'file_opened' | 'assignment_executed' | 'closing_date';
  /** Days after (or, for closing_date, before) that event. */
  offsetDays?: number;
}

const COMMON: MilestoneTemplate[] = [
  { key: 'title_opened', label: 'File opened with the title company or closing attorney', blocking: true, dueFrom: 'file_opened', offsetDays: 2 },
  { key: 'seller_emd_deposited', label: "Our earnest money deposited under the seller contract", blocking: true },
  { key: 'title_commitment', label: 'Title commitment received and reviewed', blocking: true, dueFrom: 'file_opened', offsetDays: 10 },
];

const ASSIGNMENT: MilestoneTemplate[] = [
  { key: 'assignment_executed', label: 'Assignment agreement signed by us and the buyer', blocking: true },
  { key: 'assignment_delivered', label: 'Executed assignment delivered to the closing agent', blocking: true, dueFrom: 'assignment_executed', offsetDays: 1 },
  { key: 'buyer_emd_received', label: "Buyer's deposit received by the closing agent", blocking: true, dueFrom: 'assignment_executed', offsetDays: 2 },
  { key: 'buyer_funds_verified', label: "Buyer's proof of funds verified for the full price", blocking: true },
  { key: 'title_clear', label: 'Title clear to close', blocking: true, dueFrom: 'closing_date', offsetDays: 3 },
  { key: 'closing_scheduled', label: 'Closing date and time confirmed with all parties', blocking: true, dueFrom: 'closing_date', offsetDays: 2 },
  { key: 'settlement_reviewed', label: 'Settlement statement shows the assignment fee correctly', blocking: true, dueFrom: 'closing_date', offsetDays: 1 },
];

/**
 * A double close is two closings: we buy from the seller (A-B) and sell to
 * the buyer (B-C). It needs its own funding for the first leg and its own
 * disclosures, which is why it is modelled separately and never chosen by
 * default.
 */
const DOUBLE_CLOSE: MilestoneTemplate[] = [
  { key: 'resale_contract_executed', label: 'Resale contract (B-C) signed by the buyer', blocking: true },
  { key: 'transactional_funding', label: 'Funding for the A-B purchase committed in writing', blocking: true, dueFrom: 'closing_date', offsetDays: 5 },
  { key: 'double_close_disclosed', label: 'Title company and lender informed this is a double close', blocking: true },
  { key: 'buyer_emd_received', label: "Buyer's deposit on the resale received by the closing agent", blocking: true },
  { key: 'buyer_funds_verified', label: "Buyer's proof of funds verified for the resale price", blocking: true },
  { key: 'title_clear', label: 'Title clear to close both legs', blocking: true, dueFrom: 'closing_date', offsetDays: 3 },
  { key: 'closing_scheduled', label: 'Both closings scheduled, A-B first', blocking: true, dueFrom: 'closing_date', offsetDays: 2 },
  { key: 'settlement_reviewed', label: 'Both settlement statements reviewed', blocking: true, dueFrom: 'closing_date', offsetDays: 1 },
];

export function milestoneTemplate(structure: DealStructure): MilestoneTemplate[] {
  return structure === 'double_close'
    ? [...COMMON, ...DOUBLE_CLOSE]
    : [...COMMON, ...ASSIGNMENT];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The due date for a template item, given the dates the file knows. */
export function milestoneDueDate(
  t: MilestoneTemplate,
  dates: {
    fileOpenedAt: Date;
    assignmentExecutedAt: Date | null;
    closingDate: Date | null;
  },
): Date | null {
  if (!t.dueFrom) return null;
  const days = t.offsetDays ?? 0;
  switch (t.dueFrom) {
    case 'file_opened':
      return new Date(dates.fileOpenedAt.getTime() + days * DAY_MS);
    case 'assignment_executed':
      return dates.assignmentExecutedAt
        ? new Date(dates.assignmentExecutedAt.getTime() + days * DAY_MS)
        : null;
    case 'closing_date':
      return dates.closingDate
        ? new Date(dates.closingDate.getTime() - days * DAY_MS)
        : null;
  }
}

export interface ReadinessMilestone {
  key: string;
  label: string;
  status: MilestoneStatus;
  blocking: boolean;
  dueAt: Date | null;
}

export interface ReadinessIssue {
  kind: string;
  severity: IssueSeverity;
  description: string;
  open: boolean;
}

export interface ClosingReadinessInput {
  now: Date;
  milestones: ReadinessMilestone[];
  issues: ReadinessIssue[];
  /** The seller contract's closing deadline. */
  contractDeadline: Date | null;
  scheduledClosingAt: Date | null;
}

export type AttentionLevel = 'overdue' | 'due_soon' | 'blocked' | 'warning';

export interface AttentionItem {
  level: AttentionLevel;
  text: string;
  milestoneKey?: string;
}

export interface ClosingReadiness {
  clearToClose: boolean;
  blockers: string[];
  attention: AttentionItem[];
}

const SOON_DAYS = 2;

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Whether the file can close, and what needs a person's attention: overdue
 * and imminent milestones, open blocking issues, a closing scheduled after
 * the contract deadline.
 */
export function closingReadiness(input: ClosingReadinessInput): ClosingReadiness {
  const blockers: string[] = [];
  const attention: AttentionItem[] = [];
  for (const m of input.milestones) {
    if (m.status !== 'pending') continue;
    if (m.blocking) blockers.push(m.label);
    if (m.dueAt) {
      const left = (m.dueAt.getTime() - input.now.getTime()) / DAY_MS;
      if (left < 0) {
        attention.push({
          level: 'overdue',
          text: `${m.label}: was due ${day(m.dueAt)}`,
          milestoneKey: m.key,
        });
      } else if (left <= SOON_DAYS) {
        attention.push({
          level: 'due_soon',
          text: `${m.label}: due ${day(m.dueAt)}`,
          milestoneKey: m.key,
        });
      }
    }
  }
  for (const i of input.issues) {
    if (!i.open) continue;
    if (i.severity === 'blocking') {
      blockers.push(`${i.kind} issue: ${i.description}`);
      attention.push({ level: 'blocked', text: `${i.kind}: ${i.description}` });
    } else {
      attention.push({ level: 'warning', text: `${i.kind}: ${i.description}` });
    }
  }
  if (input.contractDeadline) {
    const left = (input.contractDeadline.getTime() - input.now.getTime()) / DAY_MS;
    if (left < 0) {
      blockers.push(`The seller contract deadline (${day(input.contractDeadline)}) has passed`);
      attention.push({
        level: 'overdue',
        text: `Seller contract deadline passed ${day(input.contractDeadline)}: get an extension or the deal is lost`,
      });
    } else if (left <= 5) {
      attention.push({
        level: 'due_soon',
        text: `Seller contract deadline ${day(input.contractDeadline)}`,
      });
    }
    if (
      input.scheduledClosingAt &&
      input.scheduledClosingAt.getTime() > input.contractDeadline.getTime()
    ) {
      blockers.push('Closing is scheduled after the seller contract deadline');
      attention.push({
        level: 'blocked',
        text: `Closing ${day(input.scheduledClosingAt)} is after the contract deadline ${day(input.contractDeadline)}: get an extension`,
      });
    }
  }
  return { clearToClose: blockers.length === 0, blockers, attention };
}

/**
 * Whether the fee is revenue yet. Under `on_funds_received` it is when the
 * money is recorded as received; under `on_closing_confirmed`, when a
 * person confirmed the closing with the settlement statement. Before that
 * it is a projection.
 */
export function isRevenueRealized(
  rule: RevenueRecognitionRule,
  closing: {
    closedAt: Date | null;
    feeReceivedAt: Date | null;
    realizedFee: number | null;
  },
): boolean {
  if (closing.realizedFee == null) return false;
  return rule === 'on_funds_received'
    ? !!closing.feeReceivedAt
    : !!closing.closedAt;
}
