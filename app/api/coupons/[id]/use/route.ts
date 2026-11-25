import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { requireLineUser } from '../../../../../lib/lineAuth';
import { errorResponse } from '../../../../../lib/apiError';
import { getCouponEntitlement, entitlementMessage } from '../../../../../lib/couponEntitlement';

export const dynamic = 'force-dynamic';

// クーポンを使う（入場1回につき1枚。ルールは lib/couponEntitlement.ts）
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

    // 解約・未払いのスポンサーのクーポンは使えない
    if (coupon.sponsor_id) {
      const { data: sponsor } = await supabase
        .from('sponsors')
        .select('status')
        .eq('id', coupon.sponsor_id)
        .maybeSingle();
      if (!sponsor || sponsor.status !== 'active') {
        return NextResponse.json({ error: 'このクーポンは現在掲載を終了しています' }, { status: 404 });
      }
    }

    // 今、クーポンを使える権利があるか
    const entitlement = await getCouponEntitlement(supabase, user.userId);
    if (entitlement.state !== 'available' || !entitlement.ticketOrderId) {
      return NextResponse.json({ error: entitlementMessage(entitlement) }, { status: 403 });
    }

    // ticket_order_id の一意制約で「1入場1枚」をDBでも保証（同時押し対策）
    const { data: use, error: useError } = await supabase
      .from('coupon_uses')
      .insert({
        coupon_id: couponId,
        line_user_id: user.userId,
        ticket_order_id: entitlement.ticketOrderId,
      })
      .select('used_at')
      .single();

    if (useError) {
      if (useError.code === '23505') {
        return NextResponse.json(
          { error: '今回の入場分のクーポンは使用済みです。次のイベントに入場すると、また1枚使えます' },
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
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
