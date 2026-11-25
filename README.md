# toyama-line-ticket-coupon

登別ライブチケット＆クーポン（LINE LIFF）。LINE公式アカウントのリッチメニューから開き、

- 🎫 ライブチケットの購入（Stripe Checkout）と入場時の消込
- 🎁 スポンサー店舗クーポンの利用（LINEユーザーごとに1回）

ができる。

## 仕組み

- ユーザー識別：LIFF の IDトークンをサーバーで LINE の verify API に送って検証し、`sub`（LINEユーザーID）を確定する。
- DB：Supabase `noboribetsu-o2o`
  - `sponsor_coupons` … クーポン（スポンサー管理側が登録）
  - `coupon_uses` … クーポン利用履歴。`(coupon_id, line_user_id)` 一意で1人1回
  - `live_events` … 公演（価格・定員）
  - `ticket_orders` … チケット注文。`pending → paid → used`。1人1公演1枚
- 決済：Stripe Checkout。決済後に戻った画面で `/api/tickets/confirm` が Stripe に問い合わせて確定。Webhook でも確定（保険）。

## クーポンの利用ルール（入場特典）

実装は `lib/couponEntitlement.ts`。

1. チケットで「入場済み」になった人だけが使える（購入だけでは使えない）
2. 入場1回につき、好きなお店のクーポンを1枚だけ使える。1枚使うと、他のお店のクーポンも次のイベントまで使えない
3. 別のイベントで入場すると、また1枚使える（前回と同じお店でもよい）
4. 期限は「入場した日の翌日 23:59（日本時間）」まで
5. 使わなかった権利は持ち越さない（いちばん新しい入場の権利だけが有効）

`coupon_uses.ticket_order_id` に「どの入場の権利で使ったか」を記録し、`ticket_order_id` の一意制約で1入場1枚をDBでも保証する。管理画面のイベント集計に「店舗送客」（そのイベントの入場からのクーポン利用数）を表示する。

## API

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/coupons` | 公開中クーポン（ログイン時は自分の使用状況つき） |
| POST | `/api/coupons/[id]/use` | クーポン使用（要ログイン） |
| GET | `/api/tickets` | 公開中の公演＋自分のチケット |
| POST | `/api/tickets/checkout` | 購入開始。Stripe決済URLを返す（要ログイン） |
| POST | `/api/tickets/confirm` | 決済結果の確定（要ログイン） |
| POST | `/api/tickets/[id]/use` | 入場（要ログイン） |
| POST | `/api/stripe/webhook` | Stripe Webhook |

ログインが必要なAPIは `Authorization: Bearer <LIFF IDトークン>` を付ける。

## 環境変数（Vercel）

| 変数 | 値 |
| --- | --- |
| `NEXT_PUBLIC_LIFF_ID` | LIFF ID |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wfqngezeppfkoxvzccmw.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase の service_role キー（秘密） |
| `LINE_LOGIN_CHANNEL_ID` | LIFFアプリが属する LINEログインチャネルの「チャネルID」 |
| `STRIPE_SECRET_KEY` | Stripe テストモードのシークレットキー `sk_test_...`（秘密） |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook の署名シークレット `whsec_...`（秘密・任意） |
| `NEXT_PUBLIC_APP_URL` | 任意。決済後の戻り先。未設定ならリクエストのドメイン |

変更後は Redeploy が必要。

## Stripe（テストモード）

1. ダッシュボード右上を「テストモード」にして、開発者 → APIキー から `sk_test_...` を取得。
2. Webhook：開発者 → Webhook → エンドポイント追加
   - URL：`https://<本番ドメイン>/api/stripe/webhook`
   - イベント：`checkout.session.completed`、`checkout.session.async_payment_succeeded`
   - 署名シークレット `whsec_...` を `STRIPE_WEBHOOK_SECRET` に設定。
3. テストカード：`4242 4242 4242 4242`、有効期限は未来の日付、CVCは任意の3桁。

## LINE公式アカウントからの配信

1. LINE Developers → LINEログインチャネル → LIFF：Endpoint URL を本番URLにする。Scope は `profile`, `openid`。
2. LINE Official Account Manager → リッチメニュー：
   - 「チケット」ボタン → リンク `https://liff.line.me/<LIFF ID>?tab=tickets`
   - 「クーポン」ボタン → リンク `https://liff.line.me/<LIFF ID>?tab=coupons`
3. 友だちへの告知は Official Account Manager のメッセージ配信で同じ LIFF URL を送る。

## 管理画面

管理画面はスポンサーハブ（`toyama-sponsor-hub`）の統合管理画面に移った。このアプリの `/admin` を開くと自動で移動する。

- `https://toyama-sponsor-hub.vercel.app/admin/events` … イベント・チケット（作成・編集・公開、販売・入場・売上・店舗送客・出演応募の集計、購入者一覧、出演者募集の設定）
- `https://toyama-sponsor-hub.vercel.app/admin/coupons` … クーポン（作成・編集、店舗申請の承認／差し戻しと結果メール）
- ログインはメール（スポンサーハブの `ADMIN_EMAILS`）

### 店舗からのクーポン申請

- 店舗ローカル枠・企業プレミアム枠で契約中のスポンサーは、スポンサーハブのマイページからクーポンを申請・編集できる。
- 申請されたクーポンは `review_status = 'pending'`。統合管理画面で承認すると LINE のクーポン画面に出る。
- ユーザー画面に出る条件：`is_published = true` かつ `review_status = 'approved'`。


## 販売期間・入場受付（lib/eventWindows.ts）

- 出演者募集（任意・いつからでも）→ スポンサー先行販売 → 一般販売 → 開演（販売終了）
- 先行販売（presale_start〜general_sale_start）は、マイページで「LINEと連携する」を済ませた有効なスポンサーのみ購入可
- 先行・一般の開始時刻が未設定なら、公開と同時に一般販売
- 入場ボタンは「開演3時間前〜開演日の23:59（日本時間）」だけ有効
- 解約・未払いのスポンサーのクーポンは一覧から外れ、使用もできない

## スポンサーLINE連携（/link）

スポンサーマイページで発行した10分有効の連携コード付きURL（`https://liff.line.me/<LIFF_ID>/link?token=...`）を開くと、
`sponsor_line_links` にLINEアカウントが紐付きます。
