import { Injectable } from '@nestjs/common';
import type {
  SkipTraceAdapter,
  SkipTraceInput,
  SkipTraceResult,
} from '../dto/skip-trace.dto';

// Deterministic stub adapter — matches the input lead 50% of the time
// based on a hash of the address, so tests can reproduce both success
// and miss cases without paying for a real API call. Cost is $0; the
// pricing-rule entry is also $0 so checkAndCall doesn't budget against
// it. Selected via `SKIP_TRACE_PROVIDER=stub`.

@Injectable()
export class StubSkipTraceAdapter implements SkipTraceAdapter {
  readonly providerKey = 'stub_skiptrace';

  async appendContacts(input: SkipTraceInput): Promise<SkipTraceResult> {
    const hash = simpleHash(input.propertyAddress);
    const matched = hash % 2 === 0;
    if (!matched) {
      return { provider: this.providerKey, status: 'no_match', phones: [], emails: [] };
    }
    const last4 = String(hash % 10000).padStart(4, '0');
    return {
      provider: this.providerKey,
      status: 'matched',
      phones: [
        {
          number: `+1555${(hash % 1000000).toString().padStart(7, '0').slice(0, 7)}`,
          type: 'mobile',
          confidence: 0.85,
        },
      ],
      emails: [
        {
          email: `owner${last4}@example.test`,
          confidence: 0.7,
        },
      ],
      costUsd: 0,
    };
  }
}

function simpleHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
