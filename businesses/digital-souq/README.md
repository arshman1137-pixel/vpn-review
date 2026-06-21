# digital-souq — DigitalSouq (قوالب ومنتجات رقمية)

## What this business does

متجر منتجات رقمية للمحترفين العرب: قوالب Notion، قوالب Canva، وحزم Prompts للذكاء الاصطناعي.
مباع على Gumroad بالدولار الأمريكي — لا شحن، لا مخزون، تسليم فوري.
الإيراد: مبيعات مباشرة مع هامش ربح 100%.

## Business type

`digital_product`

## Monetization stack

| Channel | Account | Status |
|---------|---------|--------|
| Gumroad | robocoop.gumroad.com | pending setup |
| Stripe (via Gumroad) | — | auto via Gumroad |

## Product lineup (initial)

| Product | Price | Status |
|---------|-------|--------|
| قالب Notion للعمل الحر العربي | $9 | pending |
| قالب Canva لمحتوى إنستغرام بالعربي | $7 | pending |
| حزمة 50 Prompt لـ ChatGPT للأعمال العربية | $12 | pending |
| Bundle الثلاثة معًا | $19 | pending |

## Current experiments

Tracked in Supabase → `experiments` table under `startup_id = aaaaaaaa-0002-0002-0002-000000000002`.

See Mission Control → Projects → DigitalSouq for live view.

## Files in this directory

| File | Purpose |
|------|---------|
| `README.md` | This file |
| `products/` | Product files (Notion exports, Canva links, Prompt packs) |
| `gumroad-listings.md` | Gumroad product copy + pricing |
| `monetization.md` | Revenue tracking |

## Checklist

- [x] Directory created under `businesses/digital-souq/`
- [x] README filled in
- [x] Supabase row seeded via `supabase/seed-suzan.sql`
- [ ] Gumroad account created + first product published
- [ ] First product page live
- [ ] Confirmed in Mission Control → Projects
