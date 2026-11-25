import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAdmin, parseCouponInput } from '../../../../lib/adminAuth';
import { errorResponse } from '../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// 全クーポン（非公開含む）＋利用回数
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const supabase = getSupabaseAdmin();

    const { data: coupons, error } = await supabase
      .from('sponsor_coupons')
      .select('id, shop_name, benefit_title, benefit_detail, is_published, created_at')
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: uses, error: usesError } = await supabase.from('coupon_uses').select('coupon_id');
    if (usesError) return NextResponse.json({ error: usesError.message }, { status: 500 });

    const counts = new Map<string, number>();
    for (const u of uses ?? []) counts.set(u.coupon_id, (counts.get(u.coupon_id) ?? 0) + 1);

    return NextResponse.json({
      coupons: (coupons ?? []).map((c) => ({ ...c, use_count: counts.get(c.id) ?? 0 })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// クーポン作成
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseCouponInput(body, false);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('sponsor_coupons').insert(input).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: data.id });
  } catch (err) {
    return errorResponse(err);
  }
}
