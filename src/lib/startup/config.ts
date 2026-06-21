export const MAX_PIVOTS = 30

export interface BusinessTypeConfig {
  label: string
  color: string
  bg: string
}

/**
 * ビジネスタイプごとの表示設定
 * キー: business_type 値（DB カラム）
 */
export const TYPE_CONFIG: Record<string, BusinessTypeConfig> = {
  affiliate_seo: { label: 'Affiliate SEO', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
  digital_product: { label: 'Digital Product', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)' },
  game_ads: { label: 'Game + Ads', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
  saas: { label: 'SaaS', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
  physical_product: { label: 'Physical Product', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
}

/**
 * スタートアップ名 → サイト URL マッピング
 * キー: startup.name 値（DB カラム）
 */
export const SITE_URLS: Record<string, string> = {
  // Robo Co-op (original operator)
  'AI Tool Lab': 'https://robo-co-op.github.io/ai-tool-lab/',
  'Prompt Pack': 'https://robo-co-op.github.io/prompt-pack/',
  'Puzzle Games': 'https://robo-co-op.github.io/puzzle-games/',
  // Suzan — Spain / MENA
  'Patent Mining Spain': 'https://www.amazon.es/s?me=PENDING_SELLER_ID',
  'DigitalSouq': 'https://roboco-op.gumroad.com',
  'AI Sales Buddy': 'https://pronto-ai-sales-buddy.lovable.app/',
}