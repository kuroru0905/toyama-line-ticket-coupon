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
| `ADMIN_LINE_USER_IDS` | 管理画面に入れるLINEユーザーID（カンマ区切り） |
| `GMAIL_USER` | 審査結果メールの送信元Gmailアドレス |
| `GMAIL_APP_PASSWORD` | そのGmailの「アプリパスワード」（秘密）。未設定ならメールは送らない |
| `SPONSOR_MYPAGE_URL` | 任意。結果メールに載せるスポンサーマイページのURL |

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

## 管理画面（/admin）

`https://<本番ドメイン>/admin` を開き、LINEでログインする。

- 環境変数 `ADMIN_LINE_USER_IDS`（カンマ区切りのLINEユーザーID）に含まれるアカウントだけが入れる。
- 登録されていないアカウントでログインすると、そのアカウントのユーザーIDが表示されるので、それを `ADMIN_LINE_USER_IDS` に追加して Redeploy する。
- 🎫 イベント：作成・編集・公開/非公開、販売枚数・入場者数・売上、購入者一覧
- 🎁 クーポン：作成・編集・公開/非公開、利用回数
- 削除はできない。販売・掲載をやめるときは「非公開」にする（購入・利用履歴を守るため）。

### 店舗からのクーポン申請（スポンサーハブ連携）

- 店舗ローカル枠・企業プレミアム枠で契約中のスポンサーは、`toyama-sponsor-hub` のマイページからクーポンを申請・編集できる。
- 申請されたクーポンは `review_status = 'pending'`（審査待ち）。管理画面で「承認して掲載」すると LINE のクーポン画面に出る。「差し戻す」と理由が店舗のマイページに表示される。
- 店舗が内容を編集すると再び審査待ちに戻る。掲載停止/再開は審査不要。
- ユーザー画面に出る条件：`is_published = true` かつ `review_status = 'approved'`。
- メール通知（Gmail）：申請・再申請時はスポンサーハブから `ADMIN_EMAILS` へ、承認・差し戻し時はこのアプリからスポンサーの登録メールアドレスへ送る。送信に失敗しても申請・審査の処理は完了する。

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/admin/me` | 管理者かどうか |
| GET / POST | `/api/admin/events` | イベント一覧（集計つき）／作成 |
| PATCH | `/api/admin/events/[id]` | イベント編集 |
| GET | `/api/admin/events/[id]/orders` | 購入者一覧 |
| GET / POST | `/api/admin/coupons` | クーポン一覧（利用回数つき）／作成 |
| PATCH | `/api/admin/coupons/[id]` | クーポン編集 |
