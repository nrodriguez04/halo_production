# Messaging compliance

How Hālo keeps outbound SMS and email inside approval, opt-out and
quiet-hours rules. Written with the fixes for the 2026-10-10 audit (commit
`aa905d5`); see `docs/pii-encryption-design.md` for contact data at rest.

## The only way a message is sent

1. A message is created as `pending_approval` (or an agent draft is
   submitted for approval). Its recipient is stored encrypted on the row
   (`counterpartyEnc` / `counterpartyHash`), never in metadata.
2. A person approves it (`PUT /communications/messages/:id/approve`). Only
   outbound messages can be approved. Compliance is checked here too.
3. The worker picks the message up and calls
   `POST /api/internal/messages/:id/send`. It sends nothing else: no
   recipient, body or sender.
4. `MessageDispatchService` loads the message for the named tenant and
   refuses it (409) unless it is outbound, `approved`, and carries
   `approvedAt` / `approvedBy`. It then re-checks the control plane (a
   tenant with no row counts as off), DNC, consent and quiet hours. Last,
   it builds the content and sends:
   - SMS: the approved text plus "Reply STOP to opt out." (unless the text
     already gives STOP instructions), from the api's `TWILIO_PHONE_NUMBER`.
   - Email: the approved text HTML-escaped, a footer with the brand,
     `EMAIL_POSTAL_ADDRESS` and an unsubscribe link, and RFC 8058
     `List-Unsubscribe` / `List-Unsubscribe-Post` headers. If
     `PUBLIC_API_URL`, `EMAIL_FROM` or `EMAIL_POSTAL_ADDRESS` is missing,
     the send is refused (503 `NOT_CONFIGURED`).

The internal `sms/send` and `email/send` routes, which took any `to` and any
body behind the shared internal token, no longer exist.

## Opt-outs

**SMS keywords** are matched against the whole message, ignoring case,
surrounding punctuation and inner spaces or hyphens:
`STOP STOPALL UNSUBSCRIBE CANCEL END QUIT REVOKE OPTOUT` opt out, and
`HELP INFO` get the help text. "I can't stop by today" is an ordinary
reply.

Every Hālo tenant sends from one shared Twilio number, so a STOP cannot be
tied to a single tenant's message. It is recorded for **every tenant** that
has messaged the number or holds it on a lead, buyer or consent. For each of
those tenants this means a permanent DNC entry, revoked `sms` and `call`
consents, and an audit row. When no tenant matches, the STOP is recorded in
the reserved `GLOBAL` scope, which every tenant's DNC check reads. Before
this fix, such replies were filed under the tenant `unknown` and suppressed
nobody.

The webhook answers in TwiML with the confirmation or help text. Set
`SMS_KEYWORD_REPLIES=provider` if Twilio Advanced Opt-Out is configured to
send those itself. The opt-out is recorded either way. START / UNSTOP are
not handled: re-subscribing needs fresh consent and an operator.

**Email:** the unsubscribe link carries a signed message id, never the
address. GET shows a confirmation button, because mail scanners prefetch
links. POST (including one-click) adds the address to the tenant's DNC list
and revokes its email consents.

**DNC** entries name a phone, an email or both. An entry stops every
channel to that contact: the recipient address itself, plus the linked
lead's phone and email. So a contact who replied STOP is not emailed either.

## Quiet hours

The tenant's `QuietHours` row sets the window. The clock is the recipient's:
time zones come from the phone's area code
(`apps/api/src/compliance/nanp-time-zones.ts`, generated from
libphonenumber by `scripts/generate-nanp-time-zones.ts`) and the lead's
state. A send is allowed only when it is outside the window in every
candidate zone. The tenant's zone is used only when nothing about the
recipient is known.

## Configuration (api)

| variable | purpose |
|---|---|
| `PUBLIC_API_URL` | base of unsubscribe links, e.g. `https://api.haloacquisitions.com/api` |
| `EMAIL_FROM` | sender (falls back to `SENDGRID_FROM_EMAIL`) |
| `EMAIL_REPLY_TO` | Reply-To on every email: a mailbox on the Inbound Parse subdomain, so replies reach the api ([integrations/email-inbound.md](integrations/email-inbound.md)) |
| `INBOUND_EMAIL_TOKEN` | env fallback for the Inbound Parse token (`SENDGRID_INBOUND_TOKEN` on the Integrations page) |
| `EMAIL_POSTAL_ADDRESS` | physical address in every email footer |
| `MESSAGING_BRAND_NAME` | brand in replies, footers and the unsubscribe page |
| `MESSAGING_HELP_CONTACT` | contact named in the HELP reply |
| `SMS_KEYWORD_REPLIES` | `app` (default) or `provider` |
