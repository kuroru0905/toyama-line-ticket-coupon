import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  context: { params: { id: string } }
) {
  try {
    const couponId = context.params.id;
    if (!couponId) {
      return NextResponse.json({ error: 'クーポンIDが指定されていません' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: updated, error } = await supabase
      .from('sponsor_coupons')
      .update({
        is_used: true,
        used_at: new Date().toISOString(),
      })
      .eq('id', couponId)
      .eq('is_published', true)
      .eq('is_used', false)
      .select('id, shop_name, benefit_title, benefit_detail, is_published, is_used, used_at')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json(
        { error: 'このクーポンはすでに使用済みか、利用対象外です' },
        { status: 409 }
      );
    }

    return NextResponse.json({ coupon: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'サーバーエラーが発生しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
