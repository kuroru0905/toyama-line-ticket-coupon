import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getLineUserFromRequest } from '../../../lib/lineAuth';
import { errorResponse } from '../../../lib/apiError';

export const dynamic = 'force-dynamic';

// 公開中の公演一覧 ＋（ログイン済みなら）自分のチケット
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const user = await getLineUserFromRequest(req);

    const { data: events, error } = await supabase
      .from('live_events')
      .select('id, title, venue, starts_at, price_jpy, capacity, description')
      .eq('is_published', true)
      .order('starts_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let myTickets: unknown[] = [];
    if (user) {
      const { data: orders, error: ordersError } = await supabase
        .from('ticket_orders')
        .select('id, event_id, status, amount_jpy, paid_at, used_at')
        .eq('line_user_id', user.userId)
        .in('status', ['paid', 'used'])
        .order('created_at', { ascending: true });
      if (ordersError) {
        return NextResponse.json({ error: ordersError.message }, { status: 500 });
      }
      myTickets = orders ?? [];
    }

    return NextResponse.json({ events: events ?? [], tickets: myTickets });
  } catch (err) {
    return errorResponse(err);
  }
}
