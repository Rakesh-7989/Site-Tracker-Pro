# MEO / GEO — Machine-Engineered-Optimization for the SiteTrack Pro Marketing Site

> Working notes for making `sitetrackpro.in` useful to AI search engines (ChatGPT, Perplexity, Gemini, Claude) and to conventional search engines, honestly. Nothing here recommends fabrication — every claim maps to a shipped capability.

Shipped 2026-09-05 (PR #54 + this work). Applies to the public site under `src/features/marketing/site/`.

## 1. Static discoverability files (in `public/`)

| File | Purpose |
|------|---------|
| `robots.txt` | Allows `*` plus the official AI crawlers explicitly (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Claude-SearchBot); disallows `/archive/`, `/assets/`, `/*.map`. Points to sitemap. |
| `sitemap.xml` | 12 canonical URLs, all on `https://www.sitetrackpro.in`, `lastmod 2026-09-05`. Excludes `/product-tour` (301 redirect to `/product`). |
| `llms.txt` (v2) | `<4KB`. Brand + one-paragraph summary line, then a link list (Product, Features, Pricing, Solutions, Hyderabad page, Security, About, Contact) with one truthful line each, then a "Key facts" section and honest contact block. |

Verification (after deploy):
- `curl.exe -sL https://www.sitetrackpro.in/robots.txt`
- `curl.exe -sL https://www.sitetrackpro.in/sitemap.xml`
- `curl.exe -sL https://www.sitetrackpro.in/llms.txt`

## 2. Page-level structured data (JSON-LD)

All injected client-side via `useSiteJsonLd` (`src/features/marketing/site/seo.ts`). **`injectJsonLd` stringifies the object verbatim, so every payload must carry its own `"@context"`.** IDs are unique per page; `injectJsonLd` removes a previous node with the same id before inserting.

Current inventory:

| Page | Type | jsonLdId | Notes |
|------|------|----------|-------|
| `/` (HomePage) | `FAQPage` | `homepage-faq` | 5 honest Qs (incl. data security) |
| `/product` | `SoftwareApplication` | `product-software-app` | `inLanguage` en/te/hi, single `Offer` ₹5,999 |
| `/pricing` | `SoftwareApplication` | `pricing-software-app` | 3 `Offer`s matching `plans.ts` (5999/11999/19999) |
| `/contact` | `ContactPage` + nested `Organization`/`Person` | `contact-page` | Uses `COMPANY`, `CONTACT_EMAIL`, `PRODUCT` from `legalContent.ts` |
| `/construction-software-hyderabad` | `FAQPage` | `hyderabad-faq` | 3 honest Qs |

Plus a static `Organization` + `WebSite` `@graph` already in `index.html` (no `SearchAction`).

## 3. Local SEO (GEO-by-location)

The Hyderabad page (`/construction-software-hyderabad`) is the first location page. Honest hooks used:

- RERA Telangana stage tracking; statutory approvals / NOC register with expiry (fire, municipal, electrical, labour, occupancy) — all shipped.
- Telugu / Hindi / English voice DPRs and interface languages — shipped (Bhashini voice).
- Offline-first site capture — shipped.
- RA bills with GST % and TDS — shipped (18% CGST/SGST intra-state).
- Client portal — shipped.

**Deliberately excluded**: `LocalBusiness` (there is no brick-and-mortar office to claim); fabricated reviewer aggregateData; photos/reviews; any percentage-of-city claims.

## 4. Model-attention guidance (Content-Engineering)

- One clear H1 per page; each page states, in the first paragraph, exactly who the product is for (builders, contractors, architects) and the geography.
- Prices are always pulled from `plans.ts` (single source of truth): ₹5,999/₹11,999/₹19,999 per organization per month, exclusive of 18% GST; annual = 2 months free.
- Identity is always pulled from `legalContent.ts`: `COMPANY = "Rakesh Boyapati"`, `JURISDICTION = "Hyderabad, Telangana, India"`, `CONTACT_EMAIL`.
- No testimonials, no customer logos, no fake metrics, no made-up awards/certifications. If we want social proof later we must add a real, linkable source.

## 5. Known limitations / next steps

- All JSON-LD is injected client-side (React effect). Google renders JS, and common crawling is fine, but a crawler that never executes JS will not see the per-page JSON-LD. If this ever matters, add prerendering (e.g. Vercel prerender for `/` and top pages) — documented here, not yet scheduled.
- `SearchAction` (site search) intentionally omitted from the WebSite schema — the site has no functional search box.
- Hyderabad is location page #1; later candidates per the same template: Chennai, Bengaluru, Delhi NCR, Pune, Ahmedabad, Kochi. Each must reuse the honest hooks (RERA state body, municipal body, voice language, offline) and stay within shipped features.