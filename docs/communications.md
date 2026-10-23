# Communications

This covers how Hālo sends, receives and stops messages, and what must be in place before anything external goes out. External sending stays off until someone with Control Plane rights explicitly turns it on. Nothing in the code does it on its own.

The send path itself (approval by id, compliance re-checked at send time, STOP handling, signed unsubscribe links) is described in docs/messaging-compliance.md. This document covers what was added for the nationwide engine.

## 1. Principles

- **Off by default.** New tenants start with email and SMS off. Marketing needs its own switch on top of the channel's.
- **Every outbound message is approved by a person,** and every approval is audited.
- **At send time a message passes, in order:**
  - its class's switches;
  - the market gate (docs/markets.md);
  - the disposition gate for contract marketing;
  - do-not-contact, consent and quiet hours.
- **An opt-out always wins.**
  - A person's own unsubscribe, STOP or complaint can be reversed only by that person.
  - A hard bounce suppresses the address until an operator removes it.

## 2. Message classes and switches

`classifyMessage` (`packages/shared/src/communications/message-class.ts`) sorts every message into one of four classes:

| Class | What | Needs |
|---|---|---|
| `marketing` | buyer campaigns, blasts, follow-ups, a first approach to a seller, and anything Halo starts without a known type | side effects + the channel + **marketing email / marketing texts** |
| `conversational` | a reply to someone who wrote in; a counteroffer to their offer | side effects + the channel |
| `transactional` | documents to sign, closing updates, required disclosures | side effects + the channel |
| `internal_test` | a test to the operator's own address | only that the address is on `EMAIL_INTERNAL_RECIPIENTS` |

- The switches are on the Control Plane. Turning marketing on asks for an explicit authorization and is audited.
- A campaign launch is refused outright while marketing email is off.
- When a send is refused at send time, the reason is `CONTROL_PLANE_MARKETING_DISABLED` or `CONTROL_PLANE_MESSAGING_DISABLED`.
- Unsolicited automated SMS stays off: marketing texts have their own switch and also need recorded prior written consent (the TCPA requires it).

## 3. Readiness and test sends

`GET /communications/readiness` lists:
- what is configured: provider, sender, postal address, public URLs, Reply-To, inbound token, event webhook, internal recipients and Twilio;
- the switches;
- what could go out today;
- the webhook URLs to give each provider.

`POST /communications/test-send {to}` (`control_plane:write`) sends a real email through the configured provider:
- **only** to an address on `EMAIL_INTERNAL_RECIPIENTS`;
- whatever the switches say;
- audited.

It was verified end to end against a local SMTP catcher.

## 4. Consent

- **Seller consent:** `POST /leads/:id/consents {channel, source, evidence, documentId}` records consent with its evidence; revoking is a separate call. It is on the deal page's Overview tab. Before this, nothing but the seed script could create seller consent.
- **Buyer consent:** recorded as before, on the buyer's page or their deal page.
- Consent cannot be recorded for a contact who opted out.

## 5. Delivery events and suppression

| Provider | Route | Signature |
|---|---|---|
| SendGrid Event Webhook | `POST /webhooks/email/sendgrid-events` | ECDSA P-256 over timestamp + raw body, with `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` |
| Resend webhooks | `POST /webhooks/email/resend-events` | Svix HMAC-SHA256, with `RESEND_WEBHOOK_SECRET`; requests older than 5 minutes are refused |

- **Requests:**
  - an unsigned request, or one with an invalid signature, is refused;
  - without the key configured, the route answers 503 rather than trusting a body.
- **Stored events:** each event is stored once in `message_events`, keyed on the provider's event id.
- **Effects:**
  - delivered: the message is marked delivered;
  - bounce or dropped: the message is marked failed, with the reason;
  - hard bounce, drop, complaint or provider unsubscribe: an opt-out (do-not-contact entry, consents revoked);
  - complaint or unsubscribe from a buyer: the buyer is also marked do-not-market.
- **The unsubscribe link** also takes a buyer off marketing and marks their campaign targets opted out, as the deal page already did.
- **Suppression list:**
  - `GET/POST /communications/suppressions` lists and adds entries;
  - `DELETE /communications/suppressions/:id` removes only entries an operator or a bounce created.
- **Delivery health:** `GET /communications/deliverability` reports sends, deliveries, bounces, complaints, unsubscribes and the two rates providers act on, warning above 2% hard bounces or 0.1% complaints.

## 6. Inbound

- **Email:** SendGrid Inbound Parse, as before (docs/integrations/email-inbound.md).
- **SMS from a lead:** joins the lead and the Outreach Drafter, as before.
- **SMS from a buyer:** a text from a number held on exactly one buyer now joins that buyer and the deal Halo last wrote to them about, and the Buyer Responder drafts a reply for approval.
- **Twilio signature:** verified with the token from the Integrations page as well as env (sending already used it, so a token saved only there used to make every webhook 403).

## 7. Do Not Call registry

A marketing text to a homeowner is a telephone solicitation. In *Coffey v. Fast Easy Offer, LLC*, No. 25-4066 (9th Cir. June 4, 2026), texts asking a registered owner whether they had given up on selling were held adequately pleaded as telephone solicitations: the purpose of initiating the message decides, not whether it names a product. Hālo checks every marketing text against the National Do Not Call Registry data an operator imports, and refuses it when the data says no or says nothing.

**Getting the data.** The account subscribes to the registry for its area codes at telemarketing.donotcall.gov and downloads the files. An operator imports each unzipped file on **Communications → Settings → Do Not Call registry**: one number per line, with the area codes the file covers and the day it was downloaded. A state's own list can be imported the same way; it adds numbers but never covers an area code by itself.

**Coverage.** An area code is covered for 31 days after the download, the Telemarketing Sales Rule's safe-harbor limit. A new download of the same area codes replaces the old one. Data older than 31 days is refused at import because it would cover nothing.

**At send time** (creation, approval and dispatch alike), while scrubbing is required, a marketing text is refused with:

| Code | When |
|---|---|
| `DNC_REGISTRY_NOT_CURRENT` | no national data from the last 31 days covers the number's area code |
| `DNC_REGISTRY_LISTED` | the number is listed and the consent on file is not written (`written`, `form` or `deal_page`) |

- **What is checked:** marketing texts only. Replies to someone who wrote in, deal paperwork and email are not telephone solicitations and are not checked.
- **What is not counted as written:** `verbal`, `recorded_call`, `existing_relationship` and `other` consents still allow texts to numbers that are not listed. Whether an established business relationship exempts a listed number is a question for counsel; until counsel answers, it does not.
- **Calls are not covered by the platform.** Hālo does not place calls. Anyone calling a seller from Hālo's lead list must scrub the number first.
- **The requirement** (`ControlPlane.dncRegistryRequired`) starts on for every tenant: an unknown obligation never permits. Turning it off takes counsel's answer, recorded with a reason on the same card, and is audited.

Routes (`control_plane:write` to change anything):
- `GET /compliance/dnc-registry`: the requirement, covered area codes and every list with its expiry;
- `POST /compliance/dnc-registry/import`: multipart `file` with `source` (`national` or a state code), `areaCodes` and `fetchedAt` (YYYY-MM-DD);
- `DELETE /compliance/dnc-registry/:id`;
- `POST /compliance/dnc-registry/required {required, reason}`.

Numbers are stored as ten-digit integers in `dnc_registry_numbers`, used only for this check, and deleted with their list.

## 8. Configuration

| Setting | Purpose |
|---|---|
| `EMAIL_FROM`, `EMAIL_POSTAL_ADDRESS`, `PUBLIC_API_URL`, `PUBLIC_APP_URL` | required for any email |
| `USE_SENDGRID` + `SENDGRID_API_KEY`, or `RESEND_API_KEY`, or `SMTP_HOST`/`SMTP_PORT` | the provider |
| `EMAIL_REPLY_TO`, `INBOUND_EMAIL_TOKEN` | replies come back to Halo |
| `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` or `RESEND_WEBHOOK_SECRET` | delivery events |
| `EMAIL_INTERNAL_RECIPIENTS` | who may receive a test send |
| Control Plane: Email, Marketing email, SMS, Marketing texts | the switches; all off for a new tenant |

## 9. Not operational

- **No registry data has been imported.** Until it is, no marketing text can go out while scrubbing is required.
- **No external send has been made.** Turning email on is your decision on the Control Plane, and so is turning marketing email on.
- **Provider event webhooks** are tested with locally generated keys; they need the real key or secret from SendGrid or Resend.
- **Resend inbound** is not handled. Inbound email uses SendGrid Inbound Parse.
- **Large event batches:** SendGrid batches events; the API's 512 kB JSON limit holds roughly a few thousand events per request.
