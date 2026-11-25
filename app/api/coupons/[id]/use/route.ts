import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { requireLineUser } from '../../../../../lib/lineAuth';
import { errorResponse } from '../../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// クーポンを使用済みにする（LINEユーザーごとに1回だけ）
export async function POST(req: Request, context: { params: { id: string } }) {
  try {
    const couponId = context.params.id;
    if (!couponId) {
      return NextResponse.json({ error: 'クーポンIDが指定されていません' }, { status: 400 });
    }

    const user = await requireLineUser(req);
    const supabase = getSupabaseAdmin();

    const { data: coupon, error: couponError } = await supabase
      .from('sponsor_coupons')
      .select('id, shop_name, benefit_title, benefit_detail')
      .eq('id', couponId)
      .eq('is_published', true)
      .maybeSingle();

    if (couponError) {
      return NextResponse.json({ error: couponError.message }, { status: 500 });
    }
    if (!coupon) {
      return NextResponse.json({ error: 'このクーポンは利用対象外です' }, { status: 404 });
    }

    // (coupon_id, line_user_id) の一意制約で二重利用を防ぐ
    const { data: use, error: useError } = await supabase
      .from('coupon_uses')
      .insert({ coupon_id: couponId, line_user_id: user.userId })
      .select('used_at')
      .single();

    if (useError) {
      if (useError.code === '23505') {
        return NextResponse.json({ error: 'このクーポンはすでに使用済みです' }, { status: 409 });
      }
      return NextResponse.json({ error: useError.message }, { status: 500 });
    }

    return NextResponse.json({
      coupon: { ...coupon, is_used: true, used_at: use.used_at },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
