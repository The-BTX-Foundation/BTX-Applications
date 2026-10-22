# Portal Content-Security-Policy (Report-Only trial)

What it is, in plain English. A Content-Security-Policy (CSP) is a list the Portal sends with every page. It tells the browser which places the page may load scripts from, connect to, show images from and embed frames from.

Right now it runs as a **trial** (`Content-Security-Policy-Report-Only`). The browser blocks nothing. It only reports each load the list would refuse, and the Portal logs those reports. Once the trial shows the list is right, a small follow-up switches it to enforcing. From then on the browser itself refuses anything not on the list.

**Why it matters.** The Portal shows applicant data (T1: students, some of them minors), and Google's analytics tag runs on it (see `ANALYTICS.md`). The analytics filter that keeps applicant data away from Google runs inside the page. An enforced CSP is the wall behind it, and the browser keeps that wall up even if a script misbehaves.

The code:

- `lib/csp.ts` holds the list, the nonce, and the report cleaner.
- `proxy.ts` sets the header on every page.
- `app/api/csp-report/route.ts` receives reports.
- `app/layout.tsx` and `app/RaykenReview.tsx` handle the nonce.

## 1. The list

| Kind of load | Allowed from |
| --- | --- |
| Scripts | The Portal itself; the page's own inline scripts, which carry a one-time code (the nonce); Google's tag script, by path (`www.googletagmanager.com/gtag/`), so a Tag Manager container (`gtm.js`) is not allowed |
| Connections (fetch, uploads) | The Portal; the Supabase project (and its websocket address); Google Analytics (`*.google-analytics.com`) |
| Images | The Portal; `data:` and `blob:` (photo previews before upload); the Supabase project (stored photos) |
| Styles | The Portal; inline styles |
| Fonts | The Portal; `data:` |
| Frames, workers, media, manifest | The Portal only |
| Plugins (`object`) | Nothing |
| Base address, form targets, who may frame the Portal | The Portal only |

Extra entries appear only where they are needed:

| Where | Added |
| --- | --- |
| Vercel previews | Vercel's toolbar (`vercel.live`, its fonts and its websocket) |
| The review build (`NEXT_PUBLIC_RAYKEN_REVIEW=1`; since 2026-10-22 that includes production, for the board's review of the live Portal) | The review tool (`review.raykendigital.com`) |
| `next dev` on a laptop | `'unsafe-eval'` for React's error overlay, and websockets for hot reload |

**The nonce.**
- Each page response gets a fresh random code, generated in `proxy.ts`.
- Next.js reads it from the request and stamps it on every inline script it writes, so those scripts pass. The layout reads the same request header for the review loader.
- The proxy puts the policy on the request under both CSP header names, replacing anything a client sent, so a client can't choose the nonce. Request headers never reach the browser. The browser gets only the report-only response header.
- **Vercel copies response headers onto the request.** On Vercel, any `Content-Security-Policy` response header also lands on the request, in place of the proxy's. Next.js reads that name first, so it found no nonce: in production on 2026-10-19 (PR #21) Next's own scripts carried none. That is why, during the trial, there is **no enforced CSP response header** at all. `next start` doesn't copy headers this way, so only a Vercel deployment shows this; check a preview's HTML.
- No other inline script can, because it would need that response's code.
- Making every page render per request (the root layout reads the code) is what makes this work. A page built ahead of time can't carry a fresh code.

**Inline styles stay allowed.** React's `style=` attributes need them. They carry far less risk than inline scripts. The style rule never gets a nonce, because browsers then stop honouring `'unsafe-inline'` for styles.

**The rules the Portal has always enforced still are**, carried differently during the trial:
- **Framing:** `X-Frame-Options: SAMEORIGIN` (`next.config.ts`).
- **No `<base>` to another site, no plugins:** `base-uri 'self'; object-src 'none'` in a `<meta http-equiv="Content-Security-Policy">` tag, written by `app/layout.tsx` (`META_POLICY` in `lib/csp.ts`). Browsers enforce these two rules from a meta tag exactly as from a header.

## 2. Reading the reports

Browsers send reports to `/api/csp-report` through the policy's `report-uri`, right when the violation happens. The newer `report-to` is left out on purpose. With it present, Chrome sends through the Reporting API instead, which batches reports and, in testing, never delivered them from a headless browser. Every browser sends `report-uri` reports at once.

Each violation becomes one line in the Vercel runtime logs (project `btx-portal`, team btx-aps → Logs). Search for `[csp-report]`. A line looks like:

```
[csp-report] {"directive":"img-src","blocked":"https://example.com","page":"/apply/review","source":"/_next/static/chunks/abc.js","line":12,"disposition":"report"}
```

- `directive`: which kind of load was refused.
- `blocked`: where it pointed. Only the origin is kept, or a browser keyword such as `inline` or `eval`.
- `page`: the Portal route, from the same route list as analytics. Unknown pages show as `/other`.
- `source`: the script that caused it, either a Next.js file path or another site's origin.

Nothing else from a report is kept. Reports can carry page addresses with query strings, signed storage links with tokens, and snippets of page text, so the endpoint drops all of that.

How to read the reports:
- **Browser extensions.** Some reports come from extensions (password managers, ad blockers) injecting their own scripts into the page. Those log `chrome-extension` (or `moz-extension`, `safari-web-extension`) as the blocked address or the source. Ignore them.
- **Vercel's toolbar.** A `vercel.live` report on production comes from a team member's Vercel toolbar. Ignore it.
- **Counts are low.** Chrome sends one report for repeats of the same violation on a page, so a count in the logs understates how often it happens.

The endpoint is public, because browsers send reports without signing in. It reads at most 16 KB per request, logs at most 20 violations per request, never echoes anything, and always answers 204.

## 3. The trial, then enforcing

1. **Run the trial for two weeks** of real traffic (a cycle's application period is ideal).
2. **Read the `[csp-report]` lines.**
   - Each one is either a gap in the list (add the origin in `lib/csp.ts`, with a test) or something that should stay blocked.
   - **Never add an origin because of reports alone.** The endpoint is public, so anyone can post a report that looks like a real gap. Reproduce the load on the live site first (open the page and watch the browser's console), then add it.
   - Zero lines (apart from extensions) means the list is right.
3. **Switch to enforcing** in a separate PR. In `proxy.ts`, send the policy as the `Content-Security-Policy` RESPONSE header (and drop the report-only one). That single header carries the nonce, so on Vercel the copy that lands on the request is the right one. The meta tag can then go, since the policy includes `base-uri` and `object-src`. Also:
   - Keep `report-uri`, so blocked loads are still logged.
   - Cover the addresses the proxy skips. Its matcher leaves out `.png`, `.jpg`, `.svg` and `.woff2` addresses for speed, so a 404 page for one of those (say `/x.png`) renders without any policy. Either narrow the matcher to the static folders, or give those responses a policy of their own.
   - **Gate on a production build**, not only the dev server. The dev policy adds eval and websockets, so it would miss those. Build and serve the Portal in mock mode with the analytics id (`NEXT_PUBLIC_AUTH_MODE=mock NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= NEXT_PUBLIC_GA_ID=G-36BN7DJ7DN npx next build && npx next start -p 3298` in `apps/portal`). Then run `PORT=3298 npx playwright test e2e/csp.spec.ts e2e/analytics.spec.ts`. Both must pass with zero violations.
   - Consider `'strict-dynamic'` then, with care: it trusts any script a trusted script loads.

## 4. Checks

- `tests/csp.test.ts`: the list for production, previews, the review build, dev and mock mode; the nonce format; the report cleaner (both report formats, odd values, the 20-violation cap).
- `e2e/csp.spec.ts` (runs under the production name, with Google's real tag loaded):
  - The header is on every page, with a fresh nonce on each response.
  - Every inline script in the page carries that response's nonce.
  - The whole applicant path, from landing through submit plus a photo preview, causes no violation.
  - 32 review screens, the sign-out page and a missing page cause no violation.
  - A deliberately stray image is reported to `/api/csp-report` by the browser, and still loads (report-only blocks nothing).
  - The report endpoint answers 204 to good, oversized and wrong-type reports, and refuses GET.
- Mutation runs (2026-10-19). Removing Google's tag host from the list, or removing the nonce, makes the test fail with `script-src-elem` violations.
- The full Portal suite (155 tests) ran with the policy on. Its server log held no browser-sent report apart from the endpoint test's own.

## 5. Not covered, and what the list can't stop

- **Google Analytics as an exit.** `connect-src` allows `*.google-analytics.com`, which is needed for the tag's hits. A script that has already broken into the page could post data to any Google Analytics property (its own, too). The analytics filter (`ANALYTICS.md`) covers the tag's own requests, not an attacker's fresh one. React's escaping makes such an injection unlikely, so the list is a second wall here, not a guarantee.
- **The review tool.** What its widget loads after `boot.js` hasn't been inventoried. It runs only in a board member's browser that holds a review pass, on the live Portal since 2026-10-22, so the trial's reports from those browsers will show it. Turn `NEXT_PUBLIC_RAYKEN_REVIEW` off in production when the board's review ends, and the review tool's address leaves the list again.

- **Real Supabase traffic.** The tests run in mock mode, with no Supabase project. The Supabase origin is in the list (unit-tested from `NEXT_PUBLIC_SUPABASE_URL`), and the trial's reports on production will confirm it.
- **Rate limits on the report endpoint.** A flood of fake reports would only fill logs (each request is capped). If that ever happens, put the endpoint behind Vercel's firewall rate limit.
