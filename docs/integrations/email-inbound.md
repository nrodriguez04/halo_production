# Inbound email (replies to the Outreach Drafter)

Sellers answer our emails by hitting Reply. Those replies have to come back
to the api, not to a mailbox, so the Outreach Drafter can read them and
draft the answer. This uses SendGrid Inbound Parse: a subdomain whose MX
record points at SendGrid, and a webhook SendGrid posts each message to.
Any provider that can post the same fields works (the route accepts JSON
with `from`, `to`, `subject`, `text`, `html`, `headers`).

## Setup

1. **Pick a reply subdomain**, for example `reply.<your-domain>`. In DNS add
   an MX record: `reply.<your-domain>  MX 10 mx.sendgrid.net`.
2. **Authenticate the domain in SendGrid** (Settings -> Sender
   Authentication) if you have not already for sending.
3. **Generate the inbound token** and save it on the Integrations page under
   SendGrid as `SENDGRID_INBOUND_TOKEN` (anything long and random, for
   example `openssl rand -hex 24`). Inbound Parse cannot sign requests; this
   token in the URL is the authentication, so treat the URL as a secret.
4. **Add the Inbound Parse webhook** (Settings -> Inbound Parse -> Add Host &
   URL):
   - Receiving domain: `reply.<your-domain>`
   - Destination URL: `https://api.<your-domain>/api/webhooks/email/inbound?token=<the token>`
   - Leave "POST the raw, full MIME message" **unchecked** (the api reads the
     parsed fields). "Check incoming emails for spam" is fine either way.
5. **Point replies at it**: set `EMAIL_REPLY_TO=deals@reply.<your-domain>`
   (any mailbox name on the subdomain; SendGrid delivers the whole subdomain
   to the webhook). Every outbound email now carries that Reply-To, so
   replies land in the api even though the From address stays your normal
   sender.

Test it: send yourself a draft from a deal, reply to it, and watch
**Admin -> Agents** for an Outreach Drafter run with `trigger: inbound`.

## What happens to a reply

- The sender is matched to the lead that carries the address (blind index,
  the address itself stays sealed) and to the lead's open deal; the message
  is recorded as inbound email with `leadId`/`dealId`, the subject,
  `Message-ID`/`In-Reply-To` and whether it was an auto-reply. Only the part
  the person typed is kept as the message content (quoted thread, "On ...
  wrote:" blocks and phone signatures are cut); the full text is kept in
  metadata.
- Attachments (PDF, Word, Excel, CSV, text, images; up to 5, 10 MB each) are
  filed in the documents library on the lead and deal, tagged
  `inbound-email`.
- The Outreach Drafter is queued with the message (`trigger: inbound`), the
  same path an inbound text takes: rules first (opt-out phrases such as
  "unsubscribe" or "stop emailing me" record the opt-out through the
  compliance service; wrong-number phrases tag the lead), then one model
  call that classifies the reply and drafts the answer on email. Every draft
  waits in the approval queue.
- **Auto-replies and bounces** (`Auto-Submitted`, `Precedence: bulk`,
  "Automatic reply", "Undeliverable", ...) are recorded with
  `autoReply: true` and never answered.
- **A buyer replying** to a buyer blast is recorded on the deal we last
  emailed them about with a `BUYER_REPLIED` timeline event; no draft is
  produced for buyers yet.
- **Unknown senders** are stored under the `unknown` tenant where no tenant
  sees them; a sender that matches more than one tenant fails closed the
  same way.

## Configuration

| Where | Key | Purpose |
|---|---|---|
| Integrations -> SendGrid | `SENDGRID_INBOUND_TOKEN` | shared token in the Inbound Parse URL (env fallback `INBOUND_EMAIL_TOKEN`) |
| env | `EMAIL_REPLY_TO` | Reply-To on every outbound email; a mailbox on the Inbound Parse subdomain |

Route: `POST /api/webhooks/email/inbound?token=...` (also accepts the token
in an `x-inbound-token` header). Unsigned or wrong-token posts get 403.
