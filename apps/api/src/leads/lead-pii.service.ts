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

/** Injectable face of lead-pii.ts for services that need contact PII. */
@Injectable()
export class LeadPiiService {
  protect(input: ContactInput): Partial<ProtectedContact> {
    return protectContact(input);
  }

  reveal(row: ContactRow): Contact {
    return revealContact(row);
  }

  present<T extends ContactRow>(row: T, reveal: boolean) {
    return presentContact(row, reveal);
  }

  phoneHash(phone: string): string {
    return hashPhone(phone);
  }

  emailHash(email: string): string {
    return hashEmail(email);
  }
}
