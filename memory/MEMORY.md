# Launchpad Long-term Memory

> This file is auto-updated by nightly_consolidation.
> Manual edits are also allowed.

## Project Overview
- Launchpad: AI CXO multi-agent startup platform
- Operator: Jin (Jintae Kim) / Robo Co-op
- Infra: Next.js + Vercel + Supabase (ap-northeast-1)
- Repository: Robo-Co-op/StartupRobos (formerly launchpad)

## Current 3 Businesses — Suzan (suzan.attallah@roboco-op.org)
1. **Patent Mining Spain** (physical_product) — Amazon.es FBA + Amazon.de expansion — REPLACED ArabReviews
2. **DigitalSouq** (digital_product) — Gumroad, Notion/Canva templates for Arabic professionals
3. **AI Sales Buddy** (saas) — https://pronto-ai-sales-buddy.lovable.app/, Stripe billing pending

## Pivot Log
- 2026-05-14: ArabReviews (affiliate_seo) → Patent Mining Spain (physical_product)
  Reason: Higher ARPU (48% margin/unit vs ~5% affiliate), Spanish language moat on Amazon.es,
  Suzan already speaks Spanish. CEO decision — one-way door approved by operator.

## Patent Mining Spain — Key Facts
- Pipeline: USPTO PatentsView API → Claude scoring (threshold 7+) → Amazon.es FBA
- Target categories: kitchen, home, garden, pet
- Patent filter: expiry after 2014, assignee < 50 employees
- Manufacturing: Alibaba samples first (€200-400), then EU local if validated
- Revenue target: €500-1,000/month by Month 3, €2,000-5,000 by Month 6
- Amazon Seller account: €39/month (one-way door — confirm before opening)

## Agent Setup
- CEO: Opus (daily 9:00 JST heartbeat)
- CTO/CMO/COO/CFO: Sonnet (daily 21:00 JST heartbeat)
- Research: Haiku (on-demand)
- Coordinator: Sonnet (main session)

## Key Decision Log
- 2026-05-14: Pivot — ArabReviews → Patent Mining Spain (CEO approved, operator confirmed)
- 2026-05-14: Mission Control dashboard wired to mission_control_data.json (auto-update on session end)
- 2026-05-14: Suzan's 3 businesses seeded in Supabase (seed-suzan.sql)
- 2026-04-12: Monetization codes deployed for all 3 businesses (Amazon/Gumroad/AdSense)
- 2026-04-12: Vercel Cron heartbeat implemented
- 2026-04-12: Long-term memory system introduced

## Lessons Learned
- Supabase anon key + RLS = auth.uid() null → use service role key instead
- Next.js server component: no need for fetch('/api/...') → call Supabase directly
- export const dynamic = 'force-dynamic' prevents static pre-rendering
- Manus can't push to GitHub → use patch file workflow
