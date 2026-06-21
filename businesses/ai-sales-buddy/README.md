# ai-sales-buddy — AI Sales Buddy (Pronto)

## What this business does

AI widget that automates lead capture and demo booking for B2B companies.
Embedded as a script tag on any website — qualifies leads with AI, books demos directly to calendar.
Built on Lovable.dev. SaaS model with monthly Stripe subscription tiers.

Live URL: https://pronto-ai-sales-buddy.lovable.app/

## Business type

`saas`

## Monetization stack

| Channel | Account | Status |
|---------|---------|--------|
| Stripe | TBD | pending setup |
| Pricing tiers | $29 / $79 / $199 per month | pending |

## Priority next steps (from experiments)

1. Add pricing page with 3 tiers + Stripe checkout
2. Add Arabic-language UI toggle to the widget
3. Publish a case study with a pilot customer

## Current experiments

Tracked in Supabase → `experiments` table under `startup_id = aaaaaaaa-0003-0003-0003-000000000003`.

See Mission Control → Projects → AI Sales Buddy for live view.

## Files in this directory

| File | Purpose |
|------|---------|
| `README.md` | This file |
| `monetization.md` | Stripe setup + pricing strategy |

## Notes

- This business replaces the original `game_ads` slot because it already exists and has higher ARPU potential
- Arabic UI is the key differentiator for MENA B2B market (10–50x less competition)
- Lovable.dev handles hosting; this repo tracks strategy + experiments only

## Checklist

- [x] Directory created under `businesses/ai-sales-buddy/`
- [x] README filled in
- [x] Supabase row seeded via `supabase/seed-suzan.sql`
- [ ] Stripe pricing page live
- [ ] Arabic UI toggle added to widget
- [ ] First paying customer
- [ ] Confirmed in Mission Control → Projects
