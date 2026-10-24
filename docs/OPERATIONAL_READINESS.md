# Operational readiness

As of 2026-10-22. This report has four parts:
- what is built and tested;
- what works in production today;
- what waits on someone outside the code;
- the order to clear those for a first Texas transaction.

Item-by-item status is in [COMPLETION_TRACKER.md](COMPLETION_TRACKER.md).

**Built is not the same as operational.** No market is approved, no template is approved, and no external message has been sent. All three are deliberate.

## 1. Built and tested

| Area | What exists | How it was verified |
|---|---|---|
| Nationwide markets | 51 jurisdictions; bundled research (11 high, 16 medium, 24 low confidence); versioned policies; the activation ladder; authorizations; gates on every restricted action; three coverage KPIs; self-test | unit tests; integration on a real Postgres; the matrix and state pages in a browser |
| Lifecycle | approved opportunity → underwriting → reviewed purchase agreement → executed contract → verification → buyer matching → disposition approval → permitted marketing → buyer offer → reviewed assignment → closing → realized fee | Texas end to end on a real Postgres, synthetic data (`texas-lifecycle.int-spec.ts`) |
| Contracts | `.docx` and `.txt` templates with merge fields, required-field checks, versions, counsel approval per state, tamper hash, PDFs, deadline and cancellation calculations | integration tests. Word to PDF ran through `gotenberg/gotenberg:8`, and the output was read back |
| Data | property facts in enrichment; recorded sales from county CSV, ATTOM or Regrid; investor discovery with entity matching; market intelligence on ten components, each with its basis | the county CSV path end to end. ATTOM and Regrid clients are unit-tested only |
| Communications | message classes and switches; channel gates at send time; internal test sends; inbound email and SMS; unsubscribe; suppression; SendGrid and Resend delivery events; deliverability; seller consent; audit | internal test send through a local SMTP catcher; signed SendGrid events over HTTP |
| Agents | seven agents on the TypeScript worker: Lead Analyst, Deal Underwriter, Outreach Drafter, Disposition Matcher, Buyer Responder, Market Intelligence, Market Expansion. The twelve roles are mapped (agent-design.md s12) | golden set 116/116 on recorded replies; the market agents end to end against a scratch API with recorded replies |
| Security | approvals need `deals:approve`; hand-written automation runs are operator-only; uploads are typed by their bytes; webhooks are signature-verified | unit tests, including a permission pin on every approval route |
| Deployment | `docker-compose.prod.yml` (with Gotenberg); migrations apply to an empty database with no drift; the compose config resolves; the three images build and start (s5) | `prisma migrate deploy` on a fresh database; `docker compose config`; image builds and container smoke tests (s5) |

Suites at the last commit: shared 273, api 614, worker 261, web 3, integration 30, golden eval 116/116. CI was green on every commit pushed before this report.

## 2. Operational today

These work as soon as the stack is deployed with its required secrets:
- **The matrix and research drafts:** the Market Activation Matrix, the research drafts for all 51 jurisdictions, and the coverage KPIs.
- **Market workflows:** drafting a policy, submitting it, and recording counsel's approval when counsel gives it.
- **Templates:** uploading counsel's templates and approving them per state.
- **County CSV sales:** importing them, investor discovery from them, and market intelligence.
- **Communications:** the suppression list, recording seller consent, readiness checks, and internal test sends (once an email provider is configured).
- **Agent briefs and proposals:** both need AI turned on and a model key.

The coverage KPIs report:
- **Research coverage: 0.** Research is on file for all 51, but no property-data provider is configured.
- **Technical readiness: 0.** No state has approved templates and a passing self-test.
- **Active transaction markets: 0.**

## 3. External dependencies

### Legal (counsel)
- **Approve state policies.** Review and approve each state's policy, starting with Texas: answers, structures, channels, disclosures, cancellation rules and requirements, with a memo. Nothing operates in a state before this.
- **Supply and approve templates per state:** purchase agreement, assignment agreement, seller and buyer disclosures, cancellation notice. The starter scaffolds are not legal text and cannot be approved.
- **Answer the open counsel questions** in each draft. Market Expansion adds to them, and every answer it adds is marked as not verified.

### Licences and registrations
- **Texas:** foreign LLC registration (SOS Form 304), a registered agent, and franchise tax registration. Each is recorded and verified on the market's Licences tab before it counts.
- **Other states:** whatever each approved policy requires.

### Your authorizations
- **Turn on email**, then marketing email, on the Control Plane. Both are off, and the code never turns them on.
- **Marketing texts need recorded prior written consent (TCPA).** They stay off until you authorize them, and unsolicited automated texting is not enabled.

### Accounts and keys
| For | Needed |
|---|---|
| Email | SendGrid or Resend account, sending domain authentication, `EMAIL_FROM`, `EMAIL_POSTAL_ADDRESS`, public URLs, the event webhook key or secret, `EMAIL_INTERNAL_RECIPIENTS` |
| Texts | Twilio number with A2P 10DLC registration |
| E-signature | DocuSign account (JWT grant) and the Connect secret |
| Property data | ATTOM, Regrid, RentCast or Realie key (any one turns on research coverage), and county data licences where CSVs are used |
| Agents | OpenAI or Anthropic key; AI turned on per tenant |
| CI live eval | `EVAL_OPENAI_API_KEY` repository secret. Without it, live agreement for prompts is never measured (it is skipped today) |
| Identity | add `compliance:approve`, `markets:activate` and `data:write` to Descope roles for non-admins. `deals:approve` now also guards message and agent-run approval |

### Operations
- **A title company** for Texas closings.
- **A person named as each market's operator.**

## 4. First Texas transaction: the order

1. **Counsel reviews** the Texas draft, which is research-imported with high confidence, and the open questions on it. Counsel approves a version.
2. **Counsel's templates** for Texas are uploaded and approved: purchase (with the Prop. Code 5.0205 owner notice), assignment, buyer disclosure (the equitable-interest notice), seller disclosure.
3. **Registrations:** record and verify the Texas entity registration and the other requirements on the policy.
4. **Operator and self-test:** assign the operator, then run the self-test.
5. **DocuSign:** configure it.
6. **Status:** set Texas to approved for acquisition. The ladder allows only what the approved policy, the authorizations and the self-test support.
7. **First contract:** sign a seller contract. A person verifies the executed contract: assignability, legal sufficiency, disclosures.
8. **Turn on email.** For buyer marketing, also turn on marketing email, then set Texas to approved for disposition.
9. **Buyer offer:** market to buyers on the approved channels, then accept a buyer offer.
10. **Assignment:** execute the assignment.
11. **Close and record the fee.**

## 5. Deployment validation

Ran `docker compose -f docker-compose.prod.yml build api worker web` with placeholder secrets.

**The production images had stopped building.** Three defects existed before this branch, and each kept a deploy from working:

| Defect | Effect | Fix |
|---|---|---|
| Each Dockerfile copied `apps/<app>/node_modules` and `packages/shared/node_modules` from the install stage. npm workspaces hoist dependencies to the root, so those folders only exist when versions conflict. | No image built (`"/app/apps/api/node_modules": not found`). | The install stage creates them. The runtime images now carry the app's own nested modules: the worker has its own `dotenv`. |
| The web runtime stage copied `apps/web/public`, which does not exist. | The web image failed after the install was fixed. | The build stage creates it. |
| `.dockerignore` patterns only matched at the context root. | `apps/*/node_modules`, `dist`, `.next` and **`apps/web/.env.local`**, which can switch on the dev auth bypass, would be copied into images. | `**/` patterns; `.env` and `.env*.local` are never copied. |

**One web defect showed up only by running the image.** Compose set `NEXT_PUBLIC_*` as runtime environment. Next.js inlines those values when it builds, so the image served "Missing NEXT_PUBLIC_DESCOPE_PROJECT_ID" and no one could sign in. Compose now passes them as build arguments. The runbook says to rebuild the web image when they change.

**Smoke-tested images**, against a fresh migrated database, throwaway Redis and S3, and a local Gotenberg:

| Image | Result |
|---|---|
| api (861 MB) | starts; `/api/health` reports database and Redis ok; the market-context route works with the research bundled in the build output |
| worker (746 MB) | starts and listens for jobs |
| web (232 MB) | serves; the Descope project and API URL are in the bundle |
| all three | contain no `.env` file |

CI now builds all three images on every push (`docker-images`) and runs the integration suite with Gotenberg.

## 6. Known limitations

- **Market Expansion's web research answers little on its own.** Only a government page can settle a question, and the searches mostly return secondary pages and statute mirrors, so most of what they find becomes counsel questions rather than answers. That is by design: counsel confirms the law.
- **Market intelligence has no metro (CBSA) level.** Aggregation is in memory, which is fine to a few hundred thousand sales per tenant.
- **Resend inbound email is not handled.** Inbound uses SendGrid Inbound Parse.
- **State holidays and split-state time zones are approximations** in deadline counting (markets.md s5).
- **Production dependencies carry 14 known advisories** (none critical; 52 before). None of the 14 is reachable at runtime: they are Tailwind 3's build-time tooling and Nest 10 code paths the api does not use. See [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md).
- **The two newest agent prompts are unmeasured against live models.** Their golden replies are written by hand.
