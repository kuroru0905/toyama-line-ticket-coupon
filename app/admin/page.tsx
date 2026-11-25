'use client';

import React, { useCallback, useEffect, useState } from 'react';
import liff from '@line/liff';

// ---------- 型 ----------
type EventStats = { sold: number; entered: number; revenue: number; sent: number };

type AdminEvent = {
  id: string;
  title: string;
  venue: string;
  starts_at: string;
  price_jpy: number;
  capacity: number | null;
  description: string;
  is_published: boolean;
  stats: EventStats;
};

type ReviewStatus = 'pending' | 'approved' | 'rejected';

type AdminCoupon = {
  id: string;
  shop_name: string;
  benefit_title: string;
  benefit_detail: string;
  is_published: boolean;
  review_status: ReviewStatus;
  review_note: string | null;
  sponsor_name: string | null; // null = 外山企画が直接作成
  use_count: number;
};

const REVIEW_LABEL: Record<ReviewStatus, { text: string; bg: string; color: string }> = {
  pending: { text: '審査待ち', bg: '#fef3c7', color: '#b45309' },
  approved: { text: '承認済み', bg: '#dcfce7', color: '#15803d' },
  rejected: { text: '差し戻し', bg: '#fee2e2', color: '#b91c1c' },
};

type Order = {
  id: string;
  display_name: string | null;
  status: 'paid' | 'used';
  amount_jpy: number;
  paid_at: string | null;
  used_at: string | null;
};

type Tab = 'events' | 'coupons';

type EventForm = {
  id: string | null;
  title: string;
  venue: string;
  starts_at: string; // datetime-local（日本時間）
  price_jpy: string;
  capacity: string;
  description: string;
  is_published: boolean;
};

type CouponForm = {
  id: string | null;
  shop_name: string;
  benefit_title: string;
  benefit_detail: string;
  is_published: boolean;
};

const EMPTY_EVENT: EventForm = {
  id: null,
  title: '',
  venue: '',
  starts_at: '',
  price_jpy: '2000',
  capacity: '',
  description: '',
  is_published: true,
};

const EMPTY_COUPON: CouponForm = {
  id: null,
  shop_name: '',
  benefit_title: '',
  benefit_detail: '',
  is_published: true,
};

// ---------- 日時（日本時間）変換 ----------
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function isoToJstLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + JST_OFFSET_MS).toISOString().slice(0, 16);
}

function jstLocalToIso(local: string): string {
  return `${local}:00+09:00`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

// ---------- スタイル ----------
const C = {
  primary: '#0284c7',
  primaryDark: '#0369a1',
  text: '#0f172a',
  sub: '#475569',
  muted: '#94a3b8',
  border: '#e2e8f0',
  bg: '#f8fafc',
  ok: '#15803d',
  okBg: '#dcfce7',
  danger: '#b91c1c',
};

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 18,
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: C.sub,
  margin: '12px 0 4px',
};

const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 15,
  fontFamily: 'inherit',
};

function btn(kind: 'primary' | 'ghost' | 'danger' = 'primary', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
  if (kind === 'primary') return { ...base, border: 'none', backgroundColor: C.primary, color: '#fff' };
  if (kind === 'danger') return { ...base, border: `1px solid #fecaca`, backgroundColor: '#fff', color: C.danger };
  return { ...base, border: `1px solid ${C.border}`, backgroundColor: '#fff', color: C.text };
}

function pill(on: boolean, onText: string, offText: string) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 999,
        backgroundColor: on ? C.okBg : C.border,
        color: on ? C.ok : C.sub,
        whiteSpace: 'nowrap',
      }}
    >
      {on ? onText : offText}
    </span>
  );
}

// ---------- 画面 ----------
export default function AdminPage() {
  const [authState, setAuthState] = useState<'loading' | 'login' | 'denied' | 'ok' | 'error'>('loading');
  const [authMessage, setAuthMessage] = useState('');
  const [idToken, setIdToken] = useState<string | null>(null);
  const [adminName, setAdminName] = useState('');
  const [myUserId, setMyUserId] = useState('');

  const [tab, setTab] = useState<Tab>('events');
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [eventForm, setEventForm] = useState<EventForm | null>(null);
  const [couponForm, setCouponForm] = useState<CouponForm | null>(null);
  const [ordersOf, setOrdersOf] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(path, {
        ...init,
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          ...(init.headers ?? {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `エラーが発生しました（${res.status}）`);
      return json;
    },
    [idToken]
  );

  // ---- LIFFログイン → 管理者確認 ----
  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setAuthState('error');
      setAuthMessage('NEXT_PUBLIC_LIFF_ID が未設定です');
      return;
    }
    liff
      .init({ liffId })
      .then(() => {
        if (!liff.isLoggedIn()) {
          setAuthState('login');
          return;
        }
        setIdToken(liff.getIDToken());
      })
      .catch(() => {
        setAuthState('error');
        setAuthMessage('LIFFの初期化に失敗しました');
      });
  }, []);

  useEffect(() => {
    if (!idToken) return;
    api('/api/admin/me')
      .then((me: { isAdmin: boolean; userId: string; displayName: string | null }) => {
        setAdminName(me.displayName ?? '');
        setMyUserId(me.userId);
        setAuthState(me.isAdmin ? 'ok' : 'denied');
      })
      .catch((e: Error) => {
        setAuthState('error');
        setAuthMessage(e.message);
      });
  }, [idToken, api]);

  // ---- データ取得 ----
  const loadEvents = useCallback(async () => {
    const json = await api('/api/admin/events');
    setEvents(json.events ?? []);
  }, [api]);

  const loadCoupons = useCallback(async () => {
    const json = await api('/api/admin/coupons');
    setCoupons(json.coupons ?? []);
  }, [api]);

  useEffect(() => {
    if (authState !== 'ok') return;
    Promise.all([loadEvents(), loadCoupons()]).catch((e: Error) => setErrorMsg(e.message));
  }, [authState, loadEvents, loadCoupons]);

  const flash = (msg: string) => {
    setInfoMsg(msg);
    setErrorMsg(null);
    window.setTimeout(() => setInfoMsg(null), 3000);
  };

  // ---- イベント操作 ----
  const saveEvent = async () => {
    if (!eventForm) return;
    if (!eventForm.starts_at) {
      setErrorMsg('開演日時を入力してください');
      return;
    }
    const payload = {
      title: eventForm.title,
      venue: eventForm.venue,
      starts_at: jstLocalToIso(eventForm.starts_at),
      price_jpy: Number(eventForm.price_jpy),
      capacity: eventForm.capacity === '' ? null : Number(eventForm.capacity),
      description: eventForm.description,
      is_published: eventForm.is_published,
    };
    try {
      setSaving(true);
      setErrorMsg(null);
      if (eventForm.id) {
        await api(`/api/admin/events/${eventForm.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        flash('イベントを更新しました');
      } else {
        await api('/api/admin/events', { method: 'POST', body: JSON.stringify(payload) });
        flash('イベントを作成しました');
      }
      setEventForm(null);
      await loadEvents();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const toggleEventPublish = async (ev: AdminEvent) => {
    const next = !ev.is_published;
    const ok = window.confirm(
      next ? `「${ev.title}」を公開して販売を始めますか？` : `「${ev.title}」を非公開にしますか？\n（購入済みチケットはそのまま使えます）`
    );
    if (!ok) return;
    try {
      await api(`/api/admin/events/${ev.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: next }) });
      flash(next ? '公開しました' : '非公開にしました');
      await loadEvents();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '更新に失敗しました');
    }
  };

  const showOrders = async (ev: AdminEvent) => {
    if (ordersOf === ev.id) {
      setOrdersOf(null);
      return;
    }
    try {
      const json = await api(`/api/admin/events/${ev.id}/orders`);
      setOrders(json.orders ?? []);
      setOrdersOf(ev.id);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '購入者一覧の取得に失敗しました');
    }
  };

  // ---- クーポン操作 ----
  const saveCoupon = async () => {
    if (!couponForm) return;
    const payload = {
      shop_name: couponForm.shop_name,
      benefit_title: couponForm.benefit_title,
      benefit_detail: couponForm.benefit_detail,
      is_published: couponForm.is_published,
    };
    try {
      setSaving(true);
      setErrorMsg(null);
      if (couponForm.id) {
        await api(`/api/admin/coupons/${couponForm.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        flash('クーポンを更新しました');
      } else {
        await api('/api/admin/coupons', { method: 'POST', body: JSON.stringify(payload) });
        flash('クーポンを作成しました');
      }
      setCouponForm(null);
      await loadCoupons();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const reviewCoupon = async (c: AdminCoupon, status: 'approved' | 'rejected') => {
    let note: string | null = null;
    if (status === 'approved') {
      if (!window.confirm(`【${c.shop_name}】「${c.benefit_title}」を承認して、LINEに掲載しますか？`)) return;
    } else {
      note = window.prompt('差し戻しの理由を入力してください（店舗のマイページに表示されます）', '');
      if (note === null) return;
      if (!note.trim()) {
        setErrorMsg('差し戻し理由を入力してください');
        return;
      }
    }
    try {
      const res = await api(`/api/admin/coupons/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ review_status: status, review_note: note }),
      });
      const base = status === 'approved' ? '承認しました。LINEに掲載されます。' : '差し戻しました。';
      const mailNote = !c.sponsor_name
        ? ''
        : res.mailed
          ? '店舗に結果をメールしました。'
          : '※ 店舗へのメールは送れませんでした（メール設定を確認してください）。';
      flash(base + mailNote);
      await loadCoupons();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '更新に失敗しました');
    }
  };

  const toggleCouponPublish = async (c: AdminCoupon) => {
    const next = !c.is_published;
    const ok = window.confirm(
      next ? `「${c.benefit_title}」を公開しますか？` : `「${c.benefit_title}」を非公開にしますか？`
    );
    if (!ok) return;
    try {
      await api(`/api/admin/coupons/${c.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: next }) });
      flash(next ? '公開しました' : '非公開にしました');
      await loadCoupons();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '更新に失敗しました');
    }
  };

  // ---------- 表示：ログイン前・権限なし ----------
  if (authState !== 'ok') {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '40px 16px' }}>
        <h1 style={{ fontSize: 22, color: C.text }}>管理画面</h1>
        {authState === 'loading' && <p style={{ color: C.muted }}>確認中...</p>}
        {authState === 'login' && (
          <>
            <p style={{ color: C.sub, fontSize: 14 }}>管理者のLINEアカウントでログインしてください。</p>
            <button
              type="button"
              onClick={() => liff.login({ redirectUri: window.location.href })}
              style={{ ...btn(), backgroundColor: '#06c755', width: '100%', padding: 14, fontSize: 16 }}
            >
              LINEでログイン
            </button>
          </>
        )}
        {authState === 'denied' && (
          <div style={{ ...card, borderColor: '#fecaca' }}>
            <p style={{ color: C.danger, fontWeight: 700, margin: '0 0 8px' }}>
              このLINEアカウント（{adminName}）は管理者として登録されていません。
            </p>
            <p style={{ color: C.sub, fontSize: 13, margin: 0 }}>
              管理者に追加する場合は、Vercelの環境変数 ADMIN_LINE_USER_IDS に次のIDを追加してください：
            </p>
            <code style={{ display: 'block', marginTop: 8, padding: 8, background: C.bg, fontSize: 13, wordBreak: 'break-all' }}>
              {myUserId}
            </code>
          </div>
        )}
        {authState === 'error' && <p style={{ color: C.danger }}>{authMessage}</p>}
      </main>
    );
  }

  // ---------- 表示：イベントフォーム ----------
  const renderEventForm = (f: EventForm) => (
    <section style={{ ...card, borderColor: '#bae6fd', marginBottom: 16 }}>
      <h2 style={{ fontSize: 17, margin: 0, color: C.text }}>{f.id ? 'イベントを編集' : '新しいイベント'}</h2>

      <label style={label}>公演名 *</label>
      <input style={input} value={f.title} onChange={(e) => setEventForm({ ...f, title: e.target.value })} placeholder="例：MMS vol.5" />

      <label style={label}>会場 *</label>
      <input style={input} value={f.venue} onChange={(e) => setEventForm({ ...f, venue: e.target.value })} placeholder="例：登別市民会館 大ホール" />

      <label style={label}>開演日時（日本時間） *</label>
      <input
        type="datetime-local"
        style={input}
        value={f.starts_at}
        onChange={(e) => setEventForm({ ...f, starts_at: e.target.value })}
      />

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={label}>価格（円） *</label>
          <input
            type="number"
            inputMode="numeric"
            min={50}
            style={input}
            value={f.price_jpy}
            onChange={(e) => setEventForm({ ...f, price_jpy: e.target.value })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>定員（空欄＝無制限）</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            style={input}
            value={f.capacity}
            onChange={(e) => setEventForm({ ...f, capacity: e.target.value })}
          />
        </div>
      </div>

      <label style={label}>説明</label>
      <textarea
        style={{ ...input, minHeight: 80 }}
        value={f.description}
        onChange={(e) => setEventForm({ ...f, description: e.target.value })}
        placeholder="出演者、開場時間、注意事項など"
      />

      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.text }}>
        <input
          type="checkbox"
          checked={f.is_published}
          onChange={(e) => setEventForm({ ...f, is_published: e.target.checked })}
        />
        公開する（チェックを入れるとユーザー画面に表示され、購入できる）
      </label>

      {f.id && (
        <p style={{ fontSize: 12, color: C.muted, margin: '8px 0 0' }}>
          ※ 価格の変更は、これから購入する人にだけ適用されます。
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" disabled={saving} onClick={saveEvent} style={{ ...btn('primary', saving), flex: 1 }}>
          {saving ? '保存中...' : '保存する'}
        </button>
        <button type="button" disabled={saving} onClick={() => setEventForm(null)} style={btn('ghost', saving)}>
          キャンセル
        </button>
      </div>
    </section>
  );

  // ---------- 表示：クーポンフォーム ----------
  const renderCouponForm = (f: CouponForm) => (
    <section style={{ ...card, borderColor: '#bae6fd', marginBottom: 16 }}>
      <h2 style={{ fontSize: 17, margin: 0, color: C.text }}>{f.id ? 'クーポンを編集' : '新しいクーポン'}</h2>

      <label style={label}>店舗名 *</label>
      <input style={input} value={f.shop_name} onChange={(e) => setCouponForm({ ...f, shop_name: e.target.value })} placeholder="例：〇〇食堂" />

      <label style={label}>特典タイトル *</label>
      <input
        style={input}
        value={f.benefit_title}
        onChange={(e) => setCouponForm({ ...f, benefit_title: e.target.value })}
        placeholder="例：ドリンク1杯サービス"
      />

      <label style={label}>特典の詳細・利用条件 *</label>
      <textarea
        style={{ ...input, minHeight: 80 }}
        value={f.benefit_detail}
        onChange={(e) => setCouponForm({ ...f, benefit_detail: e.target.value })}
        placeholder="例：ご来店時にスタッフへ本画面を提示してください（お一人様1回限り）"
      />

      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.text }}>
        <input
          type="checkbox"
          checked={f.is_published}
          onChange={(e) => setCouponForm({ ...f, is_published: e.target.checked })}
        />
        公開する（チェックを入れるとユーザー画面に表示される）
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" disabled={saving} onClick={saveCoupon} style={{ ...btn('primary', saving), flex: 1 }}>
          {saving ? '保存中...' : '保存する'}
        </button>
        <button type="button" disabled={saving} onClick={() => setCouponForm(null)} style={btn('ghost', saving)}>
          キャンセル
        </button>
      </div>
    </section>
  );

  // ---------- 表示：イベント一覧 ----------
  const renderEvents = () => (
    <>
      {eventForm ? (
        renderEventForm(eventForm)
      ) : (
        <button type="button" onClick={() => setEventForm({ ...EMPTY_EVENT })} style={{ ...btn(), width: '100%', marginBottom: 16 }}>
          ＋ 新しいイベントを作成
        </button>
      )}

      {events.length === 0 && <div style={{ ...card, color: C.sub, fontSize: 14 }}>イベントはまだありません。</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {events.map((ev) => {
          const soldOut = ev.capacity !== null && ev.stats.sold >= ev.capacity;
          return (
            <section key={ev.id} style={{ ...card, opacity: ev.is_published ? 1 : 0.8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.primaryDark }}>{formatDateTime(ev.starts_at)} 開演</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  {soldOut && pill(false, '', '完売')}
                  {pill(ev.is_published, '公開中', '非公開')}
                </span>
              </div>
              <h3 style={{ fontSize: 18, margin: '0 0 4px', color: C.text }}>{ev.title}</h3>
              <p style={{ fontSize: 13, color: C.sub, margin: '0 0 12px' }}>
                📍 {ev.venue} ／ {yen(ev.price_jpy)}
              </p>

              {/* 集計 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                {[
                  ['販売', `${ev.stats.sold}${ev.capacity ? ` / ${ev.capacity}` : ''}枚`],
                  ['入場', `${ev.stats.entered}人`],
                  ['売上', yen(ev.stats.revenue)],
                  ['店舗送客', `${ev.stats.sent}件`],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: C.bg, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{k}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={btn('ghost')}
                  onClick={() => {
                    setEventForm({
                      id: ev.id,
                      title: ev.title,
                      venue: ev.venue,
                      starts_at: isoToJstLocal(ev.starts_at),
                      price_jpy: String(ev.price_jpy),
                      capacity: ev.capacity === null ? '' : String(ev.capacity),
                      description: ev.description,
                      is_published: ev.is_published,
                    });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  編集
                </button>
                <button type="button" style={btn(ev.is_published ? 'danger' : 'ghost')} onClick={() => toggleEventPublish(ev)}>
                  {ev.is_published ? '非公開にする' : '公開する'}
                </button>
                <button type="button" style={btn('ghost')} onClick={() => showOrders(ev)}>
                  {ordersOf === ev.id ? '購入者を閉じる' : '購入者一覧'}
                </button>
              </div>

              {ordersOf === ev.id && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  {orders.length === 0 ? (
                    <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>まだ購入者はいません。</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: C.muted, textAlign: 'left' }}>
                          <th style={{ padding: '4px 6px' }}>名前</th>
                          <th style={{ padding: '4px 6px' }}>購入</th>
                          <th style={{ padding: '4px 6px' }}>入場</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: '6px' }}>{o.display_name ?? '（名前なし）'}</td>
                            <td style={{ padding: '6px' }}>{formatDateTime(o.paid_at)}</td>
                            <td style={{ padding: '6px', color: o.status === 'used' ? C.ok : C.muted, fontWeight: 700 }}>
                              {o.status === 'used' ? formatDateTime(o.used_at) : '未入場'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );

  // ---------- 表示：クーポン一覧 ----------
  // 審査待ちを先頭に並べる
  const reviewOrder: Record<ReviewStatus, number> = { pending: 0, rejected: 1, approved: 2 };
  const sortedCoupons = [...coupons].sort((a, b) => reviewOrder[a.review_status] - reviewOrder[b.review_status]);
  const pendingCount = coupons.filter((c) => c.review_status === 'pending').length;

  const renderCoupons = () => (
    <>
      {couponForm ? (
        renderCouponForm(couponForm)
      ) : (
        <button type="button" onClick={() => setCouponForm({ ...EMPTY_COUPON })} style={{ ...btn(), width: '100%', marginBottom: 16 }}>
          ＋ 新しいクーポンを作成
        </button>
      )}

      {coupons.length === 0 && <div style={{ ...card, color: C.sub, fontSize: 14 }}>クーポンはまだありません。</div>}

      {pendingCount > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 8,
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#b45309',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          店舗から申請された審査待ちのクーポンが {pendingCount} 件あります。
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sortedCoupons.map((c) => (
          <section
            key={c.id}
            style={{
              ...card,
              opacity: c.is_published ? 1 : 0.8,
              borderColor: c.review_status === 'pending' ? '#fde68a' : C.border,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.primaryDark }}>{c.shop_name}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 999,
                    backgroundColor: REVIEW_LABEL[c.review_status].bg,
                    color: REVIEW_LABEL[c.review_status].color,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {REVIEW_LABEL[c.review_status].text}
                </span>
                {pill(c.is_published, '公開中', '非公開')}
              </span>
            </div>
            <h3 style={{ fontSize: 17, margin: '0 0 4px', color: C.text }}>{c.benefit_title}</h3>
            <p style={{ fontSize: 13, color: C.sub, margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{c.benefit_detail}</p>
            <p style={{ fontSize: 12, color: C.muted, margin: '0 0 8px' }}>
              登録：{c.sponsor_name ? `スポンサー（${c.sponsor_name}）` : '外山企画'}
            </p>
            {c.review_status === 'rejected' && c.review_note && (
              <p style={{ fontSize: 12, color: C.danger, margin: '0 0 8px' }}>差し戻し理由：{c.review_note}</p>
            )}
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>
              利用回数：{c.use_count}回
            </p>

            {c.review_status !== 'approved' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button type="button" style={{ ...btn('primary'), flex: 1 }} onClick={() => reviewCoupon(c, 'approved')}>
                  承認して掲載
                </button>
                {c.review_status === 'pending' && (
                  <button type="button" style={btn('danger')} onClick={() => reviewCoupon(c, 'rejected')}>
                    差し戻す
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                style={btn('ghost')}
                onClick={() => {
                  setCouponForm({
                    id: c.id,
                    shop_name: c.shop_name,
                    benefit_title: c.benefit_title,
                    benefit_detail: c.benefit_detail,
                    is_published: c.is_published,
                  });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                編集
              </button>
              <button type="button" style={btn(c.is_published ? 'danger' : 'ghost')} onClick={() => toggleCouponPublish(c)}>
                {c.is_published ? '非公開にする' : '公開する'}
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  );

  // ---------- 表示：本体 ----------
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 64px' }}>
      <header style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: C.primary, margin: '0 0 4px' }}>ADMIN</p>
        <h1 style={{ fontSize: 22, margin: '0 0 6px', color: C.text }}>チケット＆クーポン管理</h1>
        <p style={{ fontSize: 13, color: C.sub, margin: 0 }}>{adminName} さん（管理者）</p>
      </header>

      <nav style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        {(
          [
            ['events', '🎫 イベント'],
            ['coupons', pendingCount > 0 ? `🎁 クーポン（審査待ち ${pendingCount}）` : '🎁 クーポン'],
          ] as [Tab, string][]
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setErrorMsg(null);
            }}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderBottom: tab === key ? `3px solid ${C.primary}` : '3px solid transparent',
              background: 'none',
              fontWeight: 700,
              fontSize: 15,
              color: tab === key ? C.primaryDark : C.muted,
              cursor: 'pointer',
            }}
          >
            {text}
          </button>
        ))}
      </nav>

      {infoMsg && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 8,
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: C.ok,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {infoMsg}
        </div>
      )}
      {errorMsg && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 8,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: C.danger,
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {tab === 'events' ? renderEvents() : renderCoupons()}
    </main>
  );
}
