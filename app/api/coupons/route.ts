import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getLineUserFromRequest } from '../../../lib/lineAuth';
import { errorResponse } from '../../../lib/apiError';
import { getCouponEntitlement, entitlementMessage, type Entitlement } from '../../../lib/couponEntitlement';

export const dynamic = 'force-dynamic';

// 公開中のクーポン一覧＋（ログイン済みなら）今使えるかどうか
// 利用ルールは lib/couponEntitlement.ts を参照
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const user = await getLineUserFromRequest(req);

    const { data, error } = await supabase
      .from('sponsor_coupons')
      .select('id, shop_name, benefit_title, benefit_detail, created_at')
      .eq('is_published', true)
      .eq('review_status', 'approved')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let entitlement: Entitlement | null = null;
    if (user) {
      entitlement = await getCouponEntitlement(supabase, user.userId);
    }

    const coupons = (data ?? []).map((c) => {
      // 「使用済み」は今回の入場の権利で使ったクーポンだけ
      const usedNow = entitlement?.state === 'used' && entitlement.usedCouponId === c.id;
      return {
        id: c.id,
        shop_name: c.shop_name,
        benefit_title: c.benefit_title,
        benefit_detail: c.benefit_detail,
        is_used: usedNow,
        used_at: usedNow ? entitlement?.usedAt ?? null : null,
      };
    });

    return NextResponse.json({
      coupons,
      entitlement: entitlement
        ? {
            state: entitlement.state,
            eventTitle: entitlement.eventTitle,
            deadline: entitlement.deadline,
            message: entitlementMessage(entitlement),
          }
        : { state: 'none', eventTitle: null, deadline: null, message: 'LINEでログインすると、クーポンの利用状況が表示されます' },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
