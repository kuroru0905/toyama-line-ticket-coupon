import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { requireAdmin, parseCouponInput } from '../../../../../lib/adminAuth';
import { errorResponse, ValidationError } from '../../../../../lib/apiError';

export const dynamic = 'force-dynamic';

// クーポン編集（送られてきた項目だけ更新）
// 削除はできない仕様。掲載をやめるときは is_published=false にする（利用履歴を守るため）
export async function PATCH(req: Request, context: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseCouponInput(body, true);
    if (Object.keys(input).length === 0) throw new ValidationError('変更する項目がありません');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sponsor_coupons')
      .update(input)
      .eq('id', context.params.id)
      .select('id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'クーポンが見つかりません' }, { status: 404 });

    return NextResponse.json({ id: data.id });
  } catch (err) {
    return errorResponse(err);
  }
}
