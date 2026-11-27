import { NextResponse } from 'next/server';
import { getBannerPartners } from '@/lib/partnerBanner';

export const dynamic = 'force-dynamic';

// 公開：上部の横スクロールに出すパートナー（掲示名とロゴのURLだけ。連絡先などは返さない）
export async function GET() {
  try {
    const partners = await getBannerPartners();
    return NextResponse.json(
      { partners },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (err) {
    console.error('/api/partners error:', err);
    return NextResponse.json({ partners: [] });
  }
}
