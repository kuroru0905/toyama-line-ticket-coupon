import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getLineUserFromRequest } from '../../../lib/lineAuth';
import { errorResponse } from '../../../lib/apiError';
import { getSaleState, getEntryWindow, nextSaleOpensAt } from '../../../lib/eventWindows';
import { isActiveSponsorLineUser } from '../../../lib/sponsorLink';

export const dynamic = 'force-dynamic';

// 公開中の公演一覧（販売状態・入場受付時間つき）＋（ログイン済みなら）自分のチケット
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const user = await getLineUserFromRequest(req);

    const { data: events, error } = await supabase
      .from('live_events')
      .select('id, title, venue, starts_at, price_jpy, capacity, description, presale_start, general_sale_start, cancelled_at, cancel_reason')
      .eq('is_published', true)
      .order('starts_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let myTickets: unknown[] = [];
    let isSponsor = false;
    if (user) {
      isSponsor = await isActiveSponsorLineUser(supabase, user.userId);
      const { data: orders, error: ordersError } = await supabase
        .from('ticket_orders')
        .select('id, event_id, status, amount_jpy, paid_at, used_at, refunded_at')
        .eq('line_user_id', user.userId)
        .in('status', ['paid', 'used', 'refunded'])
        .order('created_at', { ascending: true });
      if (ordersError) {
        return NextResponse.json({ error: ordersError.message }, { status: 500 });
      }
      myTickets = orders ?? [];
    }

    const now = new Date();
    const withState = (events ?? []).map((e) => {
      const entry = getEntryWindow(e.starts_at);
      return {
        ...e,
        // 公演中止は販売・入場とも止める
        sale_state: e.cancelled_at ? 'cancelled' : getSaleState(e, now),
        sale_opens_at: nextSaleOpensAt(e),
        entry_opens_at: entry.opensAt,
        entry_closes_at: entry.closesAt,
      };
    });

    return NextResponse.json({ events: withState, tickets: myTickets, isSponsor });
  } catch (err) {
    return errorResponse(err);
  }
}
