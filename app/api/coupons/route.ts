import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sponsor_coupons')
      .select('id, shop_name, benefit_title, benefit_detail, is_published, is_used, used_at, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ coupons: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'サーバーエラーが発生しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
