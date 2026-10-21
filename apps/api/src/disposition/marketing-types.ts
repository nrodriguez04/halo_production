/**
 * Message types that market a contract to buyers. The send path re-checks
 * the disposition gate for these at the moment they leave
 * (MessageDispatchService); replies to a buyer are not in the list.
 */
export const DISPOSITION_MARKETING_TYPES = new Set([
  'buyer_blast',
  'disposition_outreach',
  'disposition_follow_up',
  'offer_counter',
]);
