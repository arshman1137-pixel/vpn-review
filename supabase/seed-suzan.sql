-- =============================================================
-- Suzan (suzan.attallah@roboco-op.org) — Seed Data
-- Run this in your Supabase SQL Editor AFTER creating your account.
-- Replace <<YOUR_USER_ID>> with your actual Supabase auth.users UUID.
-- =============================================================

-- ① Profile
insert into profiles (id, full_name, country_of_origin, current_country, languages, monthly_budget_usd, onboarding_complete)
values (
  '<<YOUR_USER_ID>>',
  'Suzan Attallah',
  'Egypt',
  'Egypt',
  ARRAY['Arabic', 'English'],
  500,
  true
)
on conflict (id) do update
  set full_name = excluded.full_name,
      languages = excluded.languages,
      onboarding_complete = excluded.onboarding_complete;

-- ② Token Budget
insert into token_budgets (user_id, total_usd, spent_usd)
values ('<<YOUR_USER_ID>>', 500.00, 0)
on conflict (user_id) do nothing;

-- ③ Startups
insert into startups (id, user_id, name, description, status, business_type, experiment_count, max_experiments)
values
  (
    'aaaaaaaa-0001-0001-0001-000000000001',
    '<<YOUR_USER_ID>>',
    'Patent Mining Spain',
    'Find expired USPTO patents in kitchen/garden/pet → manufacture via Alibaba → sell on Amazon.es FBA. 48% net margin per unit. Expand to Amazon.de/fr/it in Month 3.',
    'active',
    'physical_product',
    0,
    10
  ),
  (
    'aaaaaaaa-0002-0002-0002-000000000002',
    '<<YOUR_USER_ID>>',
    'DigitalSouq',
    'Digital product store for Arabic-speaking professionals: Notion templates, Canva templates, AI prompt packs. Sold on Gumroad in USD.',
    'active',
    'digital_product',
    0,
    10
  ),
  (
    'aaaaaaaa-0003-0003-0003-000000000003',
    '<<YOUR_USER_ID>>',
    'AI Sales Buddy',
    'AI widget that automates lead capture and demo booking for B2B companies. Built on Lovable.dev. SaaS model with Stripe billing.',
    'active',
    'saas',
    0,
    10
  )
on conflict (id) do nothing;

-- ④ Experiments — Patent Mining Spain
insert into experiments (startup_id, hypothesis, metric, target_value, status)
values
  (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'USPTO scraper returns 50+ scoreable patents in kitchen/garden/pet categories within the first run',
    'Patents fetched with complete data',
    '50',
    'running'
  ),
  (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'Claude scoring identifies 3+ products with score ≥ 7 from the first patent batch',
    'Patents with score ≥ 7',
    '3',
    'pending'
  ),
  (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'Alibaba supplier found for top-scored product at < €2/unit with MOQ ≤ 1,000 units',
    'Supplier quotes received',
    '3',
    'pending'
  );

-- ④ Experiments — DigitalSouq
insert into experiments (startup_id, hypothesis, metric, target_value, status)
values
  (
    'aaaaaaaa-0002-0002-0002-000000000002',
    'إذا أنشأنا قالب Notion للعمل الحر باللغة العربية ونشرناه على Gumroad بسعر $9، سنحقق 10 مبيعات في أسبوعين',
    'Sales count',
    '10',
    'pending'
  ),
  (
    'aaaaaaaa-0002-0002-0002-000000000002',
    'إذا شاركنا القوالب في مجموعات Telegram و Facebook العربية المتخصصة، سنحصل على 500 مشاهدة للصفحة خلال أسبوع',
    'Gumroad page views',
    '500',
    'pending'
  ),
  (
    'aaaaaaaa-0002-0002-0002-000000000002',
    'إذا عرضنا حزمة من 3 قوالب بسعر $19 (بدلًا من $9 للقالب الواحد)، سترتفع قيمة الطلب المتوسط بنسبة 50%',
    'Average order value USD',
    '19',
    'pending'
  );

-- ④ Experiments — AI Sales Buddy
insert into experiments (startup_id, hypothesis, metric, target_value, status)
values
  (
    'aaaaaaaa-0003-0003-0003-000000000003',
    'If we add a pricing page with 3 tiers ($29/$79/$199) and a Stripe checkout, we will convert 5 paying customers within 2 weeks',
    'Paying customers',
    '5',
    'pending'
  ),
  (
    'aaaaaaaa-0003-0003-0003-000000000003',
    'If we add an Arabic-language UI toggle to the widget, MENA B2B leads will increase by 30% within 2 weeks',
    'MENA lead count increase %',
    '30',
    'pending'
  ),
  (
    'aaaaaaaa-0003-0003-0003-000000000003',
    'If we publish a case study showing X% demo booking increase for a pilot customer, our landing page conversion rate will reach 5%',
    'Landing page CVR %',
    '5',
    'pending'
  );

-- ⑤ Update experiment_count
update startups set experiment_count = 3 where id in (
  'aaaaaaaa-0001-0001-0001-000000000001',
  'aaaaaaaa-0002-0002-0002-000000000002',
  'aaaaaaaa-0003-0003-0003-000000000003'
);
