export const dynamic = 'force-dynamic'

const BUSINESSES = [
  {
    id: 1,
    name: 'Patent Mining Spain',
    nameAr: 'التنقيب في براءات الاختراع — إسبانيا 🇪🇸',
    template: 'physical_product',
    templateLabel: 'Physical Product',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.1)',
    status: 'active',
    url: null,
    goals: {
      marketing: 'تحليل Amazon.es وتحديد المنتجات الأكثر طلباً في فئتي Garden وPet — إنشاء قوائم إسبانية بـ SEO محلي',
      tech: 'تشغيل USPTO pipeline (Python) → تصفية براءات الاختراع → تقييم Claude → shortlist.csv بأفضل 10 منتجات',
      operations: 'طلب عينات Alibaba للمنتج الفائز → اختبار الجودة → تجهيز شحن FBA إسبانيا',
    },
    experiments: [
      { id: 1, hypothesis: 'تشغيل pipeline على 200 براءة اختراع USPTO → قياس عدد المنتجات بدرجة 7+', status: 'pending' },
      { id: 2, hypothesis: 'تحليل top 3 منتجات على Amazon.es → قياس المنافسة والهامش المتوقع', status: 'pending' },
      { id: 3, hypothesis: 'طلب عينات Alibaba للمنتج الأول → قياس COGS الفعلي مقابل التوقع (€2/unit)', status: 'pending' },
    ],
  },
  {
    id: 2,
    name: 'DigitalSouq',
    nameAr: 'قوالب ومنتجات رقمية',
    template: 'digital_product',
    templateLabel: 'Digital Product',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.1)',
    status: 'active',
    url: null,
    goals: {
      marketing: 'إنشاء 3 قوائم منتجات عربية على Gumroad مع أوصاف SEO',
      tech: 'بناء صفحة هبوط تعرض المنتجات مع رابط Gumroad للشراء',
      operations: 'إعداد حساب Gumroad ودفع Stripe وتسليم تلقائي للمنتجات',
    },
    experiments: [
      { id: 1, hypothesis: 'نشر قالب Notion عربي بـ$9 → قياس نسبة التحويل', status: 'pending' },
      { id: 2, hypothesis: 'نشر المنتج على Twitter العربي → قياس الزيارات من السوشيال', status: 'pending' },
      { id: 3, hypothesis: 'باقة 3 قوالب بـ$19 مقابل $9 للقطعة → مقارنة ARPU', status: 'pending' },
    ],
  },
  {
    id: 3,
    name: 'AI Sales Buddy',
    nameAr: 'Pronto',
    template: 'saas',
    templateLabel: 'SaaS',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.1)',
    status: 'active',
    url: 'https://pronto-ai-sales-buddy.lovable.app/',
    goals: {
      marketing: 'كتابة محتوى الصفحة الرئيسية بالعربية والإنجليزية وتسلسل تواصل للشركات B2B في MENA',
      tech: 'إضافة صفحة تسعير + تسجيل دخول + Stripe + خيار واجهة عربية',
      operations: 'إعداد Stripe وتدفق الـ Onboarding ولوحة تحكم العميل والمراقبة',
    },
    experiments: [
      { id: 1, hypothesis: 'إضافة صفحة تسعير ($29/$79/$199) → قياس نسبة التسجيل', status: 'pending' },
      { id: 2, hypothesis: 'التواصل مع 10 شركات مصرية B2B → قياس حجز الديمو', status: 'pending' },
      { id: 3, hypothesis: 'إضافة واجهة عربية → قياس تفاعل مستخدمي MENA', status: 'pending' },
    ],
  },
]

const WEEKLY_SCHEDULE = [
  { day: 'الاثنين', focus: 'تشغيل USPTO pipeline + تحليل نتائج Patent Mining', agent: 'CTO' },
  { day: 'الثلاثاء', focus: 'المهام التقنية (Pronto + بناء المواقع)', agent: 'CTO' },
  { day: 'الأربعاء', focus: 'إنشاء المنتجات (قوائم DigitalSouq) + تحليل Amazon.es', agent: 'CMO + COO' },
  { day: 'الخميس', focus: 'SEO والتوزيع (3 مشاريع)', agent: 'CMO' },
  { day: 'الجمعة', focus: 'مراجعة الميزانية وتقييم التجارب', agent: 'CFO + CEO' },
  { day: 'السبت', focus: 'النشر والإصلاح والتكرار', agent: 'CTO + COO' },
  { day: 'الأحد', focus: 'تقرير أسبوعي وتخطيط الأسبوع القادم', agent: 'CEO' },
]

const AGENT_COLORS: Record<string, string> = {
  CMO: '#ec4899',
  CTO: '#3b82f6',
  COO: '#f97316',
  CFO: '#22c55e',
  CEO: '#f59e0b',
  'CMO + COO': '#a855f7',
  'CTO + COO': '#06b6d4',
  'CFO + CEO': '#84cc16',
}

export default function MissionControlPage() {
  return (
    <div className="flex flex-col min-h-0 overflow-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1c1c22] flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">Mission Control</h1>
          <p className="text-[11px] text-zinc-600 mt-0.5">نظرة شاملة على المشاريع الثلاثة — آخر تحديث: 2026-04-23</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[11px] text-zinc-500">3 مشاريع نشطة</span>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 space-y-6">
        {/* Businesses */}
        {BUSINESSES.map((biz, i) => (
          <div
            key={biz.id}
            className="card p-5 space-y-4"
            style={{ animation: 'fadeIn 0.3s ease-out both', animationDelay: `${i * 60}ms` }}
          >
            {/* Business header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: biz.bg, color: biz.color }}
                >
                  {biz.id}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[14px] font-semibold tracking-tight">{biz.name}</h2>
                    <span className="text-[11px] text-zinc-500">— {biz.nameAr}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                      style={{ backgroundColor: biz.bg, color: biz.color }}
                    >
                      {biz.templateLabel}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-green-500/10 text-green-400">
                      {biz.status}
                    </span>
                  </div>
                </div>
              </div>
              {biz.url && (
                <a
                  href={biz.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-zinc-600 hover:text-zinc-300 flex items-center gap-1 transition-colors shrink-0"
                >
                  <span className="w-1 h-1 rounded-full bg-green-500/60" />
                  live
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>

            {/* Goals grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <GoalCard icon="📣" label="Marketing (CMO)" text={biz.goals.marketing} color={biz.color} />
              <GoalCard icon="⚙️" label="Tech (CTO)" text={biz.goals.tech} color={biz.color} />
              <GoalCard icon="🔧" label="Operations (COO)" text={biz.goals.operations} color={biz.color} />
            </div>

            {/* Experiments */}
            <div>
              <p className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider mb-2">Experiments</p>
              <div className="space-y-1.5">
                {biz.experiments.map((exp) => (
                  <div key={exp.id} className="flex items-start gap-2.5 px-3 py-2 rounded-md bg-[#111113]">
                    <span className="text-[9px] font-mono text-zinc-600 mt-0.5 shrink-0">#{exp.id}</span>
                    <p className="text-[11px] text-zinc-400 flex-1">{exp.hypothesis}</p>
                    <StatusBadge status={exp.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Weekly Schedule */}
        <div className="card p-5">
          <p className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider mb-3">الجدول الأسبوعي المشترك</p>
          <div className="space-y-1">
            {WEEKLY_SCHEDULE.map((row) => {
              const agentColor = AGENT_COLORS[row.agent] ?? '#6b7280'
              return (
                <div
                  key={row.day}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[#111113] transition-colors"
                >
                  <span className="text-[11px] text-zinc-500 w-16 shrink-0">{row.day}</span>
                  <span className="text-[11px] text-zinc-300 flex-1">{row.focus}</span>
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{ backgroundColor: agentColor + '20', color: agentColor }}
                  >
                    {row.agent}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Budget */}
        <div className="card p-5">
          <p className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider mb-3">الميزانية الشهرية</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BudgetItem label="الميزانية الكلية" value="$500" color="#a855f7" />
            <BudgetItem label="تم الإنفاق" value="$0" color="#22c55e" />
            <BudgetItem label="المتبقي" value="$500" color="#3b82f6" />
            <BudgetItem label="حد التنبيه" value="$400 (80%)" color="#f59e0b" />
          </div>
          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-zinc-600 mb-1">
              <span>0% مستخدم</span>
              <span>$0 / $500</span>
            </div>
            <div className="h-1.5 bg-[#1c1c22] rounded-full overflow-hidden">
              <div className="h-full w-0 bg-purple-500 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoalCard({ icon, label, text, color }: { icon: string; label: string; text: string; color: string }) {
  return (
    <div className="bg-[#111113] rounded-lg p-3 space-y-1.5">
      <p className="text-[10px] font-semibold" style={{ color }}>
        {icon} {label}
      </p>
      <p className="text-[11px] text-zinc-400 leading-relaxed">{text}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'معلق', className: 'bg-zinc-800 text-zinc-500' },
    running: { label: 'جارٍ', className: 'bg-blue-500/10 text-blue-400' },
    success: { label: 'نجح', className: 'bg-green-500/10 text-green-400' },
    failed: { label: 'فشل', className: 'bg-red-500/10 text-red-400' },
  }
  const s = map[status] ?? map.pending
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${s.className}`}>{s.label}</span>
  )
}

function BudgetItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#111113] rounded-lg p-3">
      <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-[16px] font-semibold" style={{ color }}>{value}</p>
    </div>
  )
}
