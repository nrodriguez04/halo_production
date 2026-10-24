# Dependency security

Production dependency audit (`npm audit --omit=dev`), 2026-10-22:
- **Before:** 52 advisories (3 critical, 32 high, 17 moderate).
- **After:** 14 (0 critical, 5 high, 9 moderate).

2026-10-24, after Nest 11 (and Express 5): 6 (2 high, 4 moderate), every one in the table below. Two advisories were new since the 22nd: multer 2.4.0, which Nest 11 pins, and zod.

Every remaining advisory is listed below with the reason it is not exploitable here and what fixes it.

## Fixed

| Package | From → to | What it closed |
|---|---|---|
| `next` | 14.2.35 → 15.5.28 | Three unauthenticated remote code execution paths (the image optimizer with AVIF and SVG files, Windows-hosted servers), SSRF in rewrites and server actions, request smuggling in rewrites, cache poisoning, DoS. Needs React 19. |
| `react`, `react-dom` | 18.3 → 19.3 | Required by Next 15's App Router |
| `maplibre-gl` | 5.24 → 6.15 | XSS sanitizer bypass (critical). 6.x is ESM-only; `react-map-gl` 8.1.3 loads it either way. |
| `nodemailer` (api) | 7.0.13 → 10.2.1 | SMTP command injection, header injection, file-access and SSRF bypasses, recipient-domain bypasses, TLS server name reuse across transports (credential disclosure), parser DoS |
| `multer` (override) | 2.0.2 → 2.5.0 | Upload DoS, a file-size-limit bypass, crafted field names |
| `body-parser` (override) | 1.20.4 → 1.20.9 | Invalid limit silently disabling the size check |
| `qs` (override) | 6.14.2 → 6.16.1 | DoS in `stringify`, array-limit bypass |
| `postcss` (override, including Next's own copy) | 8.4.31 → 8.5.31 | XSS in stringify output, file read through `sourceMappingURL` |
| `picomatch` 4.x (override) | 4.0.1 → 4.0.4 | Glob method injection, ReDoS |
| `@nestjs/*` (api, worker) | 10.4.22 → 11.2.8, Express 4 → 5 | SSE event injection (GHSA-36xv-jgw5-4q75) and, through `@nestjs/common`, `file-type` (ZIP bomb, ASF loop) |
| `multer` (override, now exact) | Nest 11's 2.4.0 → 2.5.0 | DoS through a pending asynchronous fileFilter after request teardown (GHSA-q7qp-rjg7-q26m). Nest 11 pins 2.4.0 exactly; the root override holds 2.5.0, and the api depends on it directly (it imports `diskStorage`). |
| `body-parser` | override removed | Express 5 brings body-parser 2.4, which has the fixes the 1.20.9 pin was for |
| In-range (`npm audit fix`) | — | axios (SSRF, prototype pollution), form-data (CRLF injection), proxy-addr (IP spoofing, critical), ws, compression, path-to-regexp, js-cookie and the Descope web SDK chain, nanoid, fast-xml-builder, source-map-js |

**Overrides live in the root `package.json`.** They keep fixes inside the major versions the frameworks expect. Remove an override once the framework that pins the old version ships the fix itself.

**Runtime:**
- The production images run Node 22. Node 20 reached end of life on 2026-04-30, and 22 is supported until 2027-04.
- CI tests Node 20 and 22.
- `engines` is `>=20`.

## Remaining, and why

| Advisories | Severity | Reachable here? | Fix |
|---|---|---|---|
| `tailwindcss` 3 → chokidar, fast-glob, micromatch, braces; `postcss-nested`, `postcss-selector-parser`, `tailwindcss-animate` | 5 high, 3 moderate | **No.** Tailwind runs only during `next build`, over the repository's own source. None of it ships in the runtime images, and no request reaches it. | Tailwind 4, a CSS-first configuration rewrite. Do it with a design pass. |
| `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5: memory exhaustion validating an oversized constrained collection), and through it `openai` 4.x | high | **Limited.** Every request body is capped at 512 kB before any schema runs, and the api's collections carry `.max()` bounds, so no request can hold a collection large enough to matter. Agent replies are model output of a few kB. | zod 4: a schema API migration across `packages/shared`, the api and the worker, with `openai` 6. Not done with the framework upgrades. |

**Re-check:** `npm audit --omit=dev`. Before upgrading the frameworks themselves, read the reachability column: a new advisory on these chains may change the answer.

## Verification

Run on each step:
- lint, typecheck and build;
- every unit suite, plus the integration suite on a real Postgres;
- the golden eval.

Specific checks:
- **multer:** a real multipart upload through `FileInterceptor` (`documents.upload.spec.ts`), passing on both multer versions.
- **nodemailer 10:** a real SMTP send through `EmailSendService` to a throwaway MailHog. Headers, Reply-To, List-Unsubscribe and text and HTML parts arrived.
- **Next 15 and React 19:** all 24 app routes render in a browser against a scratch api, with no runtime error and no invalid nesting. React 19 caught one existing hydration bug, now fixed (a `div` badge inside a `p`).
- **The map:** the first check in a visible browser caught a real regression. maplibre 6 finds its web worker beside its own module, which under Next's bundler points into `/_next/static/chunks`. Next answered that request with an HTML 404, and no tile was drawn. The worker is now copied into `public/maplibre/` before `next dev` and `next build` (`scripts/copy-maplibre-worker.mjs`), and both maps pass `workerUrl`. Seen working: the base map, then roads and city labels after zooming in, with no worker errors. The production web image serves the worker as JavaScript.
- **Images:** api, worker and web build on Node 22.23 and contain no `.env` file. In the smoke test, the api is healthy (database and Redis) and its research route works, the worker listens for jobs, and the web serves with its build-time values.

- **Nest 11 and Express 5** (2026-10-24):
  - Express 5 names a wildcard and passes it as path segments: the storage routes are now `download/*key` and `*key`, and join the segments back into the object key. Tested over HTTP on a real Nest 11 server (`storage/__tests__/storage.routes.spec.ts`): nested keys download and delete, another tenant's key is refused, the fixed routes beside the wildcard still match.
  - Express 5 leaves `req.body` undefined when a request has none; Express 4 gave `{}`. `main.ts` restores `{}`, so a POST with no payload still parses against an all-optional schema (tested, and the difference confirmed on bare Express 5).
  - The request logger's routes are `{*path}`, the named form Express 5 requires; the default `*` drew a legacy-route warning on every boot.
  - `nestjs-pino`, `pino-http` and `pino-pretty` moved from the root to the api, their only user, so the logger shares the api's Nest 11 rather than keeping a Nest 10 copy at the root.
  - A boot of the built api registers all 281 routes with no warning (database unreachable on purpose, so it stops at the connection); every unit suite and lint pass.
  - Express 5's query parser is `simple`: nested keys (`a[b]=1`) are no longer objects. The web sends flat parameters only, and a repeated key is still an array.
  - **Not taken: Nest 12.** It is ESM-only (`"type": "module"`); the api, the worker and their Jest setup are CommonJS. Moving is its own migration.

**One behavior change:** nodemailer 10 reads parentheses in a display name as an RFC 5322 comment. `Halo (Texas) <deals@x>` arrives as `Halo`; quote the name to keep them (`.env.prod.example`).
