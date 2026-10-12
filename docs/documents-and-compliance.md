# Documents and compliance

**Documents** (main navigation) is the tenant's library of agreements,
disclosures, compliance records and closing paperwork, plus a checklist of
the paperwork a wholesale operation keeps on file, scored against that
library. Files live in object storage under the account; the database holds
the metadata and the links to a deal, lead or buyer.

## Library

- Upload PDF, Word, Excel, CSV, text or image files up to 25 MB. Each
  document has a category (`agreement_template`, `contract`, `disclosure`,
  `compliance`, `closing`, `marketing`, `other`), an optional state it is
  specific to, free tags, and optional links to a deal, lead or buyer.
- Opening Documents from a deal page (`/documents?dealId=...`) filters the
  library to that deal and links new uploads to it.
- Downloads go through the API with the session token, so a document is
  never reachable by URL alone. Removing a document deletes the object and
  the row.

### Contracts and signatures

Any signable document in the library (attached to the deal, or an
`agreement_template`) can be sent for e-signature from the deal page's
Contracts tab; the executed copy comes back as a `contract` document on the
deal tagged `signed` and `docusign`, carrying the source documents'
`checklist:*` tags so the checklist counts it. See
[integrations/docusign.md](integrations/docusign.md).

## Compliance checklist

The checklist is the standard paperwork set, matched by the tag
`checklist:<key>` on an active document. Upload against an item from the
Compliance tab and the tag is added for you. Items marked with a state apply
only when operating there; the **Operating state** box defaults to TX.

| Item | Why it is there |
| --- | --- |
| Purchase and sale agreement (assignable) | The seller contract; must allow assignment |
| Assignment of contract | Transfers the position to the cash buyer for the fee |
| Equitable interest disclosure (TX) | Texas requires written notice to buyers that you hold only a contractual interest; tell sellers you intend to assign. Tex. Prop. Code 5.086, Tex. Occ. Code 1101.0045 |
| Seller's disclosure notice | Property condition statement; Texas prescribes the form (Tex. Prop. Code 5.008) |
| Earnest money receipt and title instructions | Deposit proof and the instructions title closes on |
| Buyer non-disclosure / non-circumvention | Signed before a buyer sees the address |
| Proof of funds request | Qualifies the buyer before assignment |
| Assignment fee invoice and settlement statement | What title pays you, and the record |
| Wire fraud warning | Given before funds move |
| Texting and calling consent policy and scripts | TCPA consent, opt-outs and quiet hours; Halo enforces the mechanics, this is the written policy |
| Do-not-call policy and procedure | Safe-harbour requirement under the Telemarketing Sales Rule |
| Email sender identity and postal address | CAN-SPAM unsubscribe and postal address record |

The statute references are pointers for counsel to confirm, not legal
advice. The content of each document (the actual agreement text) is yours to
supply; Halo stores and tracks it.

## API

All routes are tenant-scoped under `/api/documents`:

| Route | Purpose |
| --- | --- |
| `GET /` | list; filters `category`, `dealId`, `leadId`, `buyerId`, `q`, `status` (`active` default, `archived`, `all`) |
| `POST /` (multipart) | `file` plus `category`, optional `title`, `description`, `dealId`, `leadId`, `buyerId`, `jurisdiction`, `tags` (comma list), `checklistKey` |
| `GET /:id`, `GET /:id/download` | metadata; the bytes with a `Content-Disposition` attachment header |
| `PATCH /:id` | title, description, category, links, jurisdiction, status, tags, `checklistKey` (null clears) |
| `DELETE /:id` | removes object and row |
| `GET /checklist?state=TX` | every item for the state with `have` and the documents behind it |
| `GET /summary?state=TX` | counts for the dashboard |

## Storage

Documents use the same S3-compatible store as the rest of the app
(`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`), under
`<accountId>/documents/`. The Docker Hub `minio/minio` image is no longer
published, so both compose files now run **RustFS**, a MinIO-compatible S3
server, on the same ports with the same credentials; nothing in the app
changes. Any S3 bucket (AWS S3, Cloudflare R2, Backblaze B2) works in
production with the same four variables.

## Not in this version

- Templates feeding e-signature. The DocuSign flow still builds its own
  demo PDF; pointing it at an `agreement_template` document from this library
  is the next step before real contracts go out.
- Versioning. Upload a newer document against the same checklist item; the
  older one stays in the library until archived.
