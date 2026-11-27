import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { requireLineUser } from '../../../../../lib/lineAuth';
import { errorResponse } from '../../../../../lib/apiError';
import { couponSponsorRule, getCouponEntitlement, entitlementMessage, hasRightFor, pickRight } from '../../../../../lib/couponEntitlement';

export const dynamic = 'force-dynamic';

// クーポンを使う（入場1回につき各店1回ずつ・ライブの3か月後まで。ルールは lib/couponEntitlement.ts）
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
      .select('id, sponsor_id, shop_name, benefit_title, benefit_detail')
      .eq('id', couponId)
      .eq('is_published', true)
      .eq('review_status', 'approved')
      .maybeSingle();

    if (couponError) {
      return NextResponse.json({ error: couponError.message }, { status: 500 });
    }
    if (!coupon) {
      return NextResponse.json({ error: 'このクーポンは利用対象外です' }, { status: 404 });
    }

    // 今、クーポンを使える権利があるか
    const entitlement = await getCouponEntitlement(supabase, user.userId);
    if (entitlement.state !== 'available') {
      return NextResponse.json({ error: entitlementMessage(entitlement) }, { status: 403 });
    }

    // 期限内の入場のうち、このお店が協賛したライブの入場で、まだこのクーポンを使っていないもの（期限が先のものから）
    const allowed = await couponSponsorRule(supabase, entitlement.rights.map((r) => r.eventId).filter((x): x is string => !!x));
    if (!hasRightFor(entitlement, coupon, allowed)) {
      return NextResponse.json({ error: 'このクーポンは、入場したライブでは使えません（協賛したライブの入場者向けです）' }, { status: 403 });
    }
    const right = pickRight(entitlement, coupon, allowed);
    if (!right) {
      return NextResponse.json({ error: 'このお店のクーポンは、もう使いました。次のライブに入場すると、また使えます' }, { status: 409 });
    }

    // (ticket_order_id, coupon_id) の一意制約で「1入場につき各店1回」をDBでも保証（同時押し対策）
    const { data: use, error: useError } = await supabase
      .from('coupon_uses')
      .insert({
        coupon_id: couponId,
        line_user_id: user.userId,
        ticket_order_id: right.ticketOrderId,
      })
      .select('used_at')
      .single();

    if (useError) {
      if (useError.code === '23505') {
        return NextResponse.json(
          { error: 'このお店のクーポンは、もう使いました。ほかのお店のクーポンは使えます' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: useError.message }, { status: 500 });
    }

    return NextResponse.json({
      coupon: {
        id: coupon.id,
        shop_name: coupon.shop_name,
        benefit_title: coupon.benefit_title,
        benefit_detail: coupon.benefit_detail,
        is_used: true,
        used_at: use.used_at,
        usable: false,
        deadline: null,
        event_title: right.eventTitle,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
