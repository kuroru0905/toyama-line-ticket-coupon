import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { requireAdmin, parseCouponInputWithReview } from '../../../../../lib/adminAuth';
import { errorResponse, ValidationError } from '../../../../../lib/apiError';
import { sendMail, SPONSOR_MYPAGE_URL } from '../../../../../lib/mailer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// クーポン編集・審査（送られてきた項目だけ更新）
// review_status: approved（承認）/ rejected（差し戻し、review_note 必須）/ pending
// 承認・差し戻しをしたら、スポンサーの登録メールアドレスに結果を送る
// 削除はできない仕様。掲載をやめるときは is_published=false にする（利用履歴を守るため）
export async function PATCH(req: Request, context: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseCouponInputWithReview(body, true);
    if (Object.keys(input).length === 0) throw new ValidationError('変更する項目がありません');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sponsor_coupons')
      .update(input)
      .eq('id', context.params.id)
      .select('id, shop_name, benefit_title, review_status, review_note, sponsor_id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'クーポンが見つかりません' }, { status: 404 });

    // 審査結果の通知（スポンサーが申請したクーポンだけ）
    let mailed = false;
    const decided = input.review_status === 'approved' || input.review_status === 'rejected';
    if (decided && data.sponsor_id) {
      const { data: sponsor } = await supabase
        .from('sponsors')
        .select('email, display_name')
        .eq('id', data.sponsor_id)
        .maybeSingle();

      if (sponsor?.email) {
        const approved = data.review_status === 'approved';
        mailed = await sendMail({
          to: sponsor.email,
          subject: approved
            ? `【承認】LINEクーポン「${data.benefit_title}」の掲載を開始しました`
            : `【差し戻し】LINEクーポン「${data.benefit_title}」の内容をご確認ください`,
          text: approved
            ? [
                `${sponsor.display_name} 様`,
                '',
                'いつも外山企画のイベントにご協賛いただきありがとうございます。',
                '申請いただいたLINEクーポンを承認し、LINEのクーポン画面への掲載を開始しました。',
                '',
                `店舗名：${data.shop_name}`,
                `特典：${data.benefit_title}`,
                '',
                'クーポンの利用回数や掲載の停止・再開は、スポンサーマイページから確認・操作できます。',
                SPONSOR_MYPAGE_URL,
                '',
                '外山企画 スポンサー事務局',
              ].join('\n')
            : [
                `${sponsor.display_name} 様`,
                '',
                'いつも外山企画のイベントにご協賛いただきありがとうございます。',
                '申請いただいたLINEクーポンについて、内容の修正をお願いしたい点がございます。',
                '',
                `店舗名：${data.shop_name}`,
                `特典：${data.benefit_title}`,
                '',
                '修正のお願い：',
                data.review_note ?? '',
                '',
                'お手数ですが、スポンサーマイページから内容を修正して再申請してください。',
                SPONSOR_MYPAGE_URL,
                '',
                '外山企画 スポンサー事務局',
              ].join('\n'),
        });
      }
    }

    return NextResponse.json({ id: data.id, mailed });
  } catch (err) {
    return errorResponse(err);
  }
}
