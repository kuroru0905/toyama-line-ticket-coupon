import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getLineUserFromRequest } from '../../../lib/lineAuth';
import { errorResponse } from '../../../lib/apiError';
import { activeSponsorIds } from '../../../lib/sponsorLink';
import { couponSponsorRule, getCouponEntitlement, entitlementMessage, hasRightFor, pickRight, type Entitlement } from '../../../lib/couponEntitlement';

export const dynamic = 'force-dynamic';

// 公開中のクーポン一覧＋（ログイン済みなら）クーポンごとに今使えるかどうかと期限
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

    type Row = { id: string; sponsor_id: string | null; shop_name: string; benefit_title: string; benefit_detail: string };
    let coupons;
    if (entitlement && entitlement.rights.length > 0) {
      // 期限内の入場がある：その入場のライブに協賛したお店のクーポンだけを出す（使える／この期間ではもう使った）
      const ent = entitlement;
      const allowed = await couponSponsorRule(supabase, ent.rights.map((r) => r.eventId).filter((x): x is string => !!x));
      coupons = ((data ?? []) as Row[])
        .filter((c) => hasRightFor(ent, c, allowed))
        .map((c) => {
          const right = pickRight(ent, c, allowed);
          const usedAt = right ? null : ent.allUsed[c.id] ?? null;
          return {
            id: c.id,
            shop_name: c.shop_name,
            benefit_title: c.benefit_title,
            benefit_detail: c.benefit_detail,
            is_used: !right,
            used_at: usedAt,
            usable: !!right,
            deadline: right?.deadline ?? null,
            event_title: right?.eventTitle ?? null,
          };
        });
    } else {
      // まだ入場していない・期限切れ：協賛中のスポンサーのクーポンを見本として出す（解約・未払い・期間終了は出さない）
      const activeIds = await activeSponsorIds(supabase);
      coupons = ((data ?? []) as Row[])
        .filter((c) => !c.sponsor_id || activeIds.has(c.sponsor_id))
        .map((c) => ({
          id: c.id,
          shop_name: c.shop_name,
          benefit_title: c.benefit_title,
          benefit_detail: c.benefit_detail,
          is_used: false,
          used_at: null,
          usable: false,
          deadline: null,
          event_title: null,
        }));
    }

    return NextResponse.json({
      coupons,
      entitlement: entitlement
        ? {
            state: entitlement.state,
            eventTitle: entitlement.latestTitle,
            deadline: entitlement.lastDeadline,
            liveCount: entitlement.rights.length,
            message: entitlementMessage(entitlement),
          }
        : { state: 'none', eventTitle: null, deadline: null, liveCount: 0, message: 'LINEでログインすると、クーポンの利用状況が表示されます' },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
