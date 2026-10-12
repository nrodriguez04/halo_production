# DocuSign: contracts from the documents library

Envelopes are built from documents in the library (`/documents`) and sent to
real people on the deal: the seller on the lead, a buyer from the buyer list,
or a named recipient a person types in. The executed copy comes back into the
library on the deal. Nothing is ever sent to a placeholder address.

## What you need from DocuSign

1. **A developer (demo) account** to start, a production account to go live.
   Admin -> Apps and Keys.
2. **An app with an integration key.** On the app:
   - Authentication: **Service Integration** (JWT grant). Generate an RSA
     key pair and keep the private key.
   - Redirect URI: `https://developers.docusign.com/platform/auth/consent`
     (used once, for consent).
3. **The API user id** (the GUID of the user the integration acts as, from
   Apps and Keys -> My Account Information) and the **API account id**.
4. **Consent, once per user and environment.** Open the URL the Integrations
   page shows when the test fails with "consent required", sign in as the API
   user, accept. Then test again.
5. **A Connect webhook** (optional but recommended): Settings -> Connect ->
   Add configuration -> Custom.
   - URL: `https://api.<your-domain>/api/webhooks/docusign`
   - Events: envelope sent, delivered, completed, declined, voided.
   - Include HMAC signature; the key is the Connect Secret below.
   - Data format: JSON (the "Aggregate messages" and "Include documents"
     options can stay off; the api downloads the combined PDF itself).

## Keys on the Integrations page (Contracts -> DocuSign)

| Key | What it is |
|---|---|
| `DOCUSIGN_CLIENT_ID` | Integration key |
| `DOCUSIGN_USER_ID` | API user GUID the integration impersonates |
| `DOCUSIGN_ACCOUNT_ID` | API account id |
| `DOCUSIGN_RSA_PRIVATE_KEY` | The RSA private key (PEM). A one-line paste is fine; it is re-wrapped. |
| `DOCUSIGN_ENV` | `demo` (default) or `production` |
| `DOCUSIGN_CONNECT_SECRET` | HMAC key configured on the Connect webhook |
| `DOCUSIGN_BASE_URL` | Optional override of the account base URI; normally resolved from DocuSign |

The same names work as environment variables; the Integrations page wins
when both are set. **Test Connection** runs the whole JWT grant and reports
the account name and base URI.

## Sending

Deal page -> Contracts -> **Send for signature**:

- Documents: anything signable attached to the deal plus every
  `agreement_template` in the library (PDF, Word, text, images; 25 MB total).
- Recipients: the seller (needs an email on the lead), a buyer (needs an
  email on the buyer), and optionally one more named person. Addresses are
  revealed api-side and sealed on the message rows; the contract record keeps
  roles and names only.
- Anchors: put `[SELLER_SIGNATURE]`, `[SELLER_DATE]`, `[BUYER_SIGNATURE]`,
  `[BUYER_DATE]` (white text works) in a template and the tabs land there.
  Without anchors the signer places their own signature.

Sending a deal in `negotiating` moves it to `under_contract`, which queues
the Disposition Matcher. Every envelope goes through cost control
(`docusign` / `create_envelope`; price it on the Cost Governance page if your
plan charges per envelope).

## After signing

- With Connect: `envelope-completed` marks the contract `completed`, files
  the combined signed PDF in the library (`category: contract`, tags
  `signed`, `docusign`, plus the source documents' `checklist:*` tags so the
  compliance checklist counts the executed copy), and moves an
  `under_contract` deal to `marketing`.
- Without Connect: the **Refresh** button reads the status from DocuSign and
  **Pull signed copy** files the PDF the same way once the envelope is
  complete.

## API

- `POST /integrations/docusign/envelopes`
  `{ dealId, documentIds: [...], recipients: [{ role: 'seller' | 'buyer' | 'other', buyerId?, name?, email?, routingOrder? }], emailSubject?, emailBlurb? }`
- `GET /integrations/docusign/envelopes/:envelopeId/status` (refreshes the contract)
- `GET /integrations/docusign/envelopes/:envelopeId/pdf` (base64)
- `POST /integrations/docusign/contracts/:contractId/store-signed`
- `POST /webhooks/docusign` (Connect, HMAC `x-docusign-signature-1`)

## Failure modes you will see

| Message | Meaning | Fix |
|---|---|---|
| `NOT_CONFIGURED DOCUSIGN_*` | A key is missing | Fill it on the Integrations page |
| `consent_required` (+ URL) | The API user has not granted consent for this integration key | Open the URL as that user, accept |
| `invalid_grant` | Wrong user id, wrong key pair, or clock skew | Re-check the user GUID and the private key |
| `account ... not available to this API user` | The user is not a member of that account | Use the account id shown under the user |
| 403 on the webhook | Connect secret mismatch or missing HMAC | Match `DOCUSIGN_CONNECT_SECRET` to the Connect configuration |
