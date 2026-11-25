import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAdmin, parseEventInput } from '../../../../lib/adminAuth';
import { errorResponse } from '../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// 全イベント（非公開含む）＋販売状況の集計
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const supabase = getSupabaseAdmin();

    const { data: events, error } = await supabase
      .from('live_events')
      .select('id, title, venue, starts_at, price_jpy, capacity, description, is_published, created_at')
      .order('starts_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: orders, error: ordersError } = await supabase
      .from('ticket_orders')
      .select('event_id, status, amount_jpy')
      .in('status', ['paid', 'used']);
    if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 });

    const stats = new Map<string, { sold: number; entered: number; revenue: number }>();
    for (const o of orders ?? []) {
      const s = stats.get(o.event_id) ?? { sold: 0, entered: 0, revenue: 0 };
      s.sold += 1;
      if (o.status === 'used') s.entered += 1;
      s.revenue += o.amount_jpy;
      stats.set(o.event_id, s);
    }

    return NextResponse.json({
      events: (events ?? []).map((e) => ({
        ...e,
        stats: stats.get(e.id) ?? { sold: 0, entered: 0, revenue: 0 },
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// イベント作成
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseEventInput(body, false);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('live_events').insert(input).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: data.id });
  } catch (err) {
    return errorResponse(err);
  }
}
