import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireLineUser } from '../../../../lib/lineAuth';
import { createCheckoutSession } from '../../../../lib/stripe';
import { errorResponse } from '../../../../lib/apiError';
import { getSaleState, formatJst } from '../../../../lib/eventWindows';
import { isActiveSponsorLineUser } from '../../../../lib/sponsorLink';

export const dynamic = 'force-dynamic';

// チケット購入：注文(pending)を作り、Stripe Checkout の決済ページURLを返す
export async function POST(req: Request) {
  try {
    const user = await requireLineUser(req);
    const body = (await req.json().catch(() => ({}))) as { eventId?: string };
    if (!body.eventId) {
      return NextResponse.json({ error: '公演IDが指定されていません' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: event, error: eventError } = await supabase
      .from('live_events')
      .select('id, title, price_jpy, capacity, starts_at, presale_start, general_sale_start, cancelled_at')
      .eq('id', body.eventId)
      .eq('is_published', true)
      .maybeSingle();
    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }
    if (!event) {
      return NextResponse.json({ error: 'この公演は販売していません' }, { status: 404 });
    }

    if (event.cancelled_at) {
      return NextResponse.json({ error: 'この公演は中止になりました' }, { status: 409 });
    }

    // 販売期間のチェック（開演後は販売終了／先行販売はスポンサーのみ）
    const saleState = getSaleState(event);
    if (saleState === 'ended') {
      return NextResponse.json({ error: '開演時刻を過ぎたため、販売を終了しました' }, { status: 409 });
    }
    if (saleState === 'before') {
      const opens = event.presale_start || event.general_sale_start;
      return NextResponse.json(
        { error: opens ? `販売開始は ${formatJst(opens)} からです` : 'まだ販売を開始していません' },
        { status: 409 }
      );
    }
    if (saleState === 'presale') {
      const sponsor = await isActiveSponsorLineUser(supabase, user.userId);
      if (!sponsor) {
        const general = event.general_sale_start ? `一般販売は ${formatJst(event.general_sale_start)} からです。` : '';
        return NextResponse.json(
          {
            error: `現在はスポンサー先行販売中です。${general}スポンサーの方は、マイページから「LINEと連携する」を行ってください`,
          },
          { status: 403 }
        );
      }
    }

    // すでに購入済みか
    const { data: owned } = await supabase
      .from('ticket_orders')
      .select('id')
      .eq('event_id', event.id)
      .eq('line_user_id', user.userId)
      .in('status', ['paid', 'used'])
      .limit(1);
    if (owned && owned.length > 0) {
      return NextResponse.json({ error: 'この公演のチケットはすでにお持ちです' }, { status: 409 });
    }

    // 残席チェック（支払済み・使用済みの枚数で判定）
    if (event.capacity) {
      const { count, error: countError } = await supabase
        .from('ticket_orders')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .in('status', ['paid', 'used']);
      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }
      if ((count ?? 0) >= event.capacity) {
        return NextResponse.json({ error: '完売しました' }, { status: 409 });
      }
    }

    const { data: order, error: orderError } = await supabase
      .from('ticket_orders')
      .insert({
        event_id: event.id,
        line_user_id: user.userId,
        display_name: user.displayName,
        status: 'pending',
        amount_jpy: event.price_jpy,
      })
      .select('id')
      .single();
    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const session = await createCheckoutSession({
      orderId: order.id,
      eventTitle: event.title,
      amountJpy: event.price_jpy,
      successUrl: `${origin}/?tab=tickets&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/?tab=tickets&canceled=1`,
    });

    await supabase
      .from('ticket_orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
