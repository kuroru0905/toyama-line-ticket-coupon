import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getLineUserFromRequest } from '../../../lib/lineAuth';
import { errorResponse } from '../../../lib/apiError';

export const dynamic = 'force-dynamic';

// 公開中のクーポン一覧。LINEログイン済みなら「自分が使ったかどうか」も返す（1人1回）
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const user = await getLineUserFromRequest(req);

    const { data, error } = await supabase
      .from('sponsor_coupons')
      .select('id, shop_name, benefit_title, benefit_detail, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const usedMap = new Map<string, string>();
    if (user && data && data.length > 0) {
      const { data: uses, error: usesError } = await supabase
        .from('coupon_uses')
        .select('coupon_id, used_at')
        .eq('line_user_id', user.userId)
        .in(
          'coupon_id',
          data.map((c) => c.id)
        );
      if (usesError) {
        return NextResponse.json({ error: usesError.message }, { status: 500 });
      }
      for (const u of uses ?? []) usedMap.set(u.coupon_id, u.used_at);
    }

    const coupons = (data ?? []).map((c) => ({
      id: c.id,
      shop_name: c.shop_name,
      benefit_title: c.benefit_title,
      benefit_detail: c.benefit_detail,
      is_used: usedMap.has(c.id),
      used_at: usedMap.get(c.id) ?? null,
    }));

    return NextResponse.json({ coupons });
  } catch (err) {
    return errorResponse(err);
  }
}
