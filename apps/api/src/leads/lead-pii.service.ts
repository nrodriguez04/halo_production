import { Injectable } from '@nestjs/common';
import { hashEmail, hashPhone } from '@halo/shared';
import {
  presentContact,
  protectContact,
  revealContact,
  type Contact,
  type ContactInput,
  type ContactRow,
  type ProtectedContact,
} from './lead-pii';

/**
 * Injectable face of lead-pii.ts for services that need contact PII.
 *
 * `reveal` is for system use only (addressing a send, a DocuSign signer):
 * its output must not be returned to a caller. Responses either mask here
 * or go through PIIService.presentLead(s), which audits the reveal.
 */
@Injectable()
export class LeadPiiService {
  protect(input: ContactInput): Partial<ProtectedContact> {
    return protectContact(input);
  }

  reveal(row: ContactRow): Contact {
    return revealContact(row);
  }

  mask<T extends ContactRow>(row: T) {
    return presentContact(row, false);
  }

  phoneHash(phone: string): string {
    return hashPhone(phone);
  }

  emailHash(email: string): string {
    return hashEmail(email);
  }
}
