import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getLineUserFromRequest } from '../../../lib/lineAuth';
import { errorResponse } from '../../../lib/apiError';
import { activeSponsorIds } from '../../../lib/sponsorLink';
import { couponSponsorsForEvent, getCouponEntitlement, entitlementMessage, type Entitlement } from '../../../lib/couponEntitlement';

export const dynamic = 'force-dynamic';

// 公開中のクーポン一覧＋（ログイン済みなら）今使えるかどうか
// 利用ルールは lib/couponEntitlement.ts を参照
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const user = await getLineUserFromRequest(req);

    const { data, error } = await supabase
      .from('sponsor_coupons')
      .select('id, sponsor_id, shop_name, benefit_title, benefit_detail, created_at')
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

    // 入場したライブがあるとき：そのライブに協賛した企業・お店のクーポンだけ（外山企画の直接登録分＝sponsor_idなしは表示）
    // まだ入場していないとき：協賛中のスポンサーのクーポンを見本として出す（解約・未払い・期間終了は出さない）
    let allowed: (id: string) => boolean;
    if (entitlement?.eventId) {
      allowed = await couponSponsorsForEvent(supabase, entitlement.eventId);
    } else {
      const activeIds = await activeSponsorIds(supabase);
      allowed = (id: string) => activeIds.has(id);
    }
    const visible = (data ?? []).filter((c) => !c.sponsor_id || allowed(c.sponsor_id));

    const coupons = visible.map((c) => {
      // 「使用済み」は今回の入場で使ったクーポンだけ（前のライブで使ったお店も、新しい入場ではまた使える）
      const usedAt = entitlement?.used[c.id] ?? null;
      const usedNow = Boolean(usedAt);
      return {
        id: c.id,
        shop_name: c.shop_name,
        benefit_title: c.benefit_title,
        benefit_detail: c.benefit_detail,
        is_used: usedNow,
        used_at: usedAt,
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
