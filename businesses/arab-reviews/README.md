# arab-reviews — ArabReviews (أفضل المنتجات)

## What this business does

موقع مراجعات تقنية باللغة العربية يستهدف سوق MENA (مصر، السعودية، الإمارات).
يراجع الأجهزة والبرمجيات والمنتجات التقنية مع روابط أفلييت لـ Amazon.eg و Amazon.sa و Noon.
الإيراد: عمولات الأفلييت من كل عملية شراء عبر الروابط.

## Business type

`affiliate_seo`

## Monetization stack

| Channel | Account | Status |
|---------|---------|--------|
| Amazon Associates Egypt | tag=arabreviews-eg-21 | pending |
| Amazon Associates Saudi | tag=arabreviews-sa-21 | pending |
| Noon Affiliate | TBD | pending |

## Target keywords (CMO brief)

- أفضل لابتوب للطلاب (Egypt / Saudi)
- مقارنة [منتج أ] vs [منتج ب] بالعربي
- سعر [جهاز] في مصر / السعودية
- برنامج [X] مجاني للعرب

## Current experiments

Tracked in Supabase → `experiments` table under `startup_id = aaaaaaaa-0001-0001-0001-000000000001`.

See Mission Control → Projects → ArabReviews for live view.

## Files in this directory

| File | Purpose |
|------|---------|
| `README.md` | This file |
| `articles/` | Arabic SEO articles (CMO produces) |
| `keyword-research.md` | Keyword strategy per market |
| `monetization.md` | Affiliate account setup + revenue tracking |

## Checklist

- [x] Directory created under `businesses/arab-reviews/`
- [x] README filled in
- [x] Supabase row seeded via `supabase/seed-suzan.sql`
- [ ] Amazon Associates accounts approved
- [ ] First 5 articles published
- [ ] Confirmed in Mission Control → Projects
