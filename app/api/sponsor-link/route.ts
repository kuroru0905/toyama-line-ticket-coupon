import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireLineUser } from '../../../lib/lineAuth';
import { errorResponse } from '../../../lib/apiError';

export const dynamic = 'force-dynamic';

// スポンサーマイページで発行した連携コード（10分有効・1回限り）で、
// このLINEアカウントをスポンサー契約に紐付ける
export async function POST(req: Request) {
  try {
    const user = await requireLineUser(req);
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return NextResponse.json({ error: '連携コードがありません。マイページからやり直してください' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    // 未使用・期限内のトークンを「使用済み」にする（同時押しでも1回だけ成功）
    const { data: claimed, error: claimError } = await supabase
      .from('sponsor_link_tokens')
      .update({ used_at: nowIso })
      .eq('token', token)
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .select('sponsor_id')
      .maybeSingle();
    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }
    if (!claimed) {
      return NextResponse.json(
        { error: '連携コードの有効期限が切れたか、すでに使われています。マイページからもう一度お試しください' },
        { status: 410 }
      );
    }

    const { data: sponsor } = await supabase
      .from('sponsors')
      .select('id, display_name, status')
      .eq('id', claimed.sponsor_id)
      .maybeSingle();
    if (!sponsor) {
      return NextResponse.json({ error: 'スポンサー契約が見つかりません' }, { status: 404 });
    }

    const { error: linkError } = await supabase.from('sponsor_line_links').upsert(
      {
        sponsor_id: sponsor.id,
        line_user_id: user.userId,
        display_name: user.displayName,
        linked_at: nowIso,
      },
      { onConflict: 'sponsor_id' }
    );
    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    return NextResponse.json({
      sponsorName: sponsor.display_name,
      active: sponsor.status === 'active',
    });
  } catch (err) {
    return errorResponse(err);
  }
}
