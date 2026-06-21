# Patent Mining Spain 🇪🇸
> Physical products via expired USPTO patents → Amazon.es FBA

**Pivot from:** ArabReviews (affiliate_seo) — 2026-05-14
**CEO decision:** Higher ARPU (48% margin), Spanish language moat, operator speaks Spanish

## What this business does

1. Scrape expired/expiring USPTO patents in kitchen, home, garden, pet categories
2. Score each patent with Claude API (ease of manufacturing, Amazon.es demand, margin)
3. Source top-scored products from Alibaba (samples €200-400)
4. List on Amazon.es FBA → expand to .de / .fr / .it

## Business type

`physical_product`

## Unit Economics (example at €14.99)

| Item | Amount |
|------|--------|
| Sale price | €14.99 |
| Manufacturing (Alibaba) | −€2.00 |
| Shipping to FBA | −€0.80 |
| Amazon FBA fees | −€3.50 |
| PPC ads | −€1.50 |
| **Net profit** | **€7.19 (48%)** |

## Pipeline

```
USPTO PatentsView API
        ↓
pipeline/scraper.py  — filter: expiry>2014, CPC A47J/A01G/A01K, employees<50
        ↓
pipeline/scorer.py   — Claude scores 1-10, keep ≥ 7
        ↓
pipeline/analyzer.py — Amazon.es BSR + Helium 10 validation (manual step)
        ↓
Alibaba sourcing → FBA listing → PPC launch
```

## Monetization stack

| Channel | Account | Status |
|---------|---------|--------|
| Amazon.es FBA | Seller account | pending — €39/month ONE-WAY DOOR |
| Amazon.de FBA | Same account | Month 3+ |
| Amazon.fr / .it | Same account | Month 6+ |

## Target categories (Spain-specific)

| Category | CPC Code | Why Spain |
|----------|----------|-----------|
| 🍳 Kitchen tools | A47J | High home-cooking culture |
| 🌿 Garden / balcony | A01G | Strong balcony culture |
| 🐕 Pet products | A01K | Spain = #3 EU pet ownership |
| 🏖️ Beach / outdoor | A63H, A47G | Tourism + climate |

## Revenue goals

| Month | Goal |
|-------|------|
| 1 | Pipeline ready + product identified |
| 2 | Samples approved + listing live |
| 3 | €500-1,000 MRR |
| 6 | €2,000-5,000 MRR |
| 12 | 3-5 products + Amazon.de live |

## Files

| File | Purpose |
|------|---------|
| `README.md` | This file |
| `pipeline/scraper.py` | USPTO PatentsView API scraper |
| `pipeline/scorer.py` | Claude API patent scorer |
| `pipeline/config.py` | Filters, thresholds, API settings |
| `pipeline/requirements.txt` | Python dependencies |
| `data/raw/` | Raw patent JSON from scraper |
| `data/scored/` | Scored patents (score ≥ 7) |
| `data/shortlist.csv` | Final shortlist for sourcing |

## Checklist

- [x] Directory created under `businesses/patent-mining-spain/`
- [x] Python pipeline scripts written (scraper + scorer)
- [x] Supabase row updated in seed-suzan.sql
- [x] MEMORY.md + MISSION_CONTROL.md updated
- [ ] USPTO PatentsView API — run first scrape (target: 50+ patents)
- [ ] Claude scoring — identify first 3+ products with score ≥ 7
- [ ] Amazon.es Best Sellers + Helium 10 validation
- [ ] Alibaba RFQ for top product
- [ ] Amazon Seller account (ONE-WAY DOOR — confirm first)
