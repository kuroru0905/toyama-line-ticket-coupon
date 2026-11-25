'use client';

import React, { useCallback, useEffect, useState } from 'react';
import liff from '@line/liff';

type Coupon = {
  id: string;
  shop_name: string;
  benefit_title: string;
  benefit_detail: string;
  is_used: boolean;
  used_at: string | null;
};

type LiveEvent = {
  id: string;
  title: string;
  venue: string;
  starts_at: string;
  price_jpy: number;
  capacity: number | null;
  description: string;
  presale_start: string | null;
  general_sale_start: string | null;
  sale_state: 'before' | 'presale' | 'general' | 'ended';
  sale_opens_at: string | null;
  entry_opens_at: string;
  entry_closes_at: string;
};

type Ticket = {
  id: string;
  event_id: string;
  status: 'paid' | 'used';
  amount_jpy: number;
  paid_at: string | null;
  used_at: string | null;
};

type Tab = 'tickets' | 'coupons';

// クーポンを使える権利（入場1回につき1枚）
type CouponEntitlement = {
  state: 'none' | 'not_entered' | 'available' | 'used' | 'expired';
  eventTitle: string | null;
  deadline: string | null;
  message: string;
};

const COLORS = {
  primary: '#0284c7',
  primaryDark: '#0369a1',
  text: '#0f172a',
  sub: '#475569',
  muted: '#94a3b8',
  border: '#e2e8f0',
  ok: '#15803d',
  okBg: '#dcfce7',
};

// 特商法・プライバシーポリシーはスポンサーサイトに一本化
const LEGAL_SITE = process.env.NEXT_PUBLIC_SPONSOR_SITE_URL || 'https://toyama-sponsor-hub.vercel.app';

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('tickets');
  const [liffReady, setLiffReady] = useState(false);
  const [liffStatus, setLiffStatus] = useState('確認中');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('ゲスト');

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [entitlement, setEntitlement] = useState<CouponEntitlement | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isSponsor, setIsSponsor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // ---- LIFF 初期化 ----
  useEffect(() => {
    // liff.line.me 経由だとクエリは liff.init 後に復元されるので、初期化前後で2回読む
    const readTab = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'coupons') setTab('coupons');
    };
    readTab();

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setLiffStatus('ブラウザプレビュー（NEXT_PUBLIC_LIFF_ID 未設定）');
      setLiffReady(true);
      return;
    }

    liff
      .init({ liffId })
      .then(async () => {
        setLiffStatus(liff.isInClient() ? 'LINEアプリ内' : '外部ブラウザ');
        if (!liff.isLoggedIn()) {
          setNeedsLogin(true);
          return;
        }
        setIdToken(liff.getIDToken());
        try {
          const profile = await liff.getProfile();
          setDisplayName(profile.displayName);
        } catch {
          // 表示名が取れなくても動作には影響しない
        }
      })
      .catch(() => {
        setLiffStatus('LIFF初期化エラー（設定を確認してください）');
      })
      .finally(() => {
        readTab();
        setLiffReady(true);
      });
  }, []);

  const authHeaders = useCallback((): HeadersInit => {
    return idToken ? { Authorization: `Bearer ${idToken}` } : {};
  }, [idToken]);

  // ---- データ取得 ----
  const fetchAll = useCallback(async () => {
    try {
      const [cRes, tRes] = await Promise.all([
        fetch('/api/coupons', { cache: 'no-store', headers: authHeaders() }),
        fetch('/api/tickets', { cache: 'no-store', headers: authHeaders() }),
      ]);
      const cJson = await cRes.json();
      const tJson = await tRes.json();
      if (!cRes.ok) throw new Error(cJson.error || 'クーポンの取得に失敗しました');
      if (!tRes.ok) throw new Error(tJson.error || 'チケットの取得に失敗しました');
      setCoupons(cJson.coupons ?? []);
      setEntitlement(cJson.entitlement ?? null);
      setEvents(tJson.events ?? []);
      setTickets(tJson.tickets ?? []);
      setIsSponsor(Boolean(tJson.isSponsor));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  // ---- 決済から戻ってきたときの確定処理 ----
  useEffect(() => {
    if (!liffReady) return;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const canceled = params.get('canceled');

    const run = async () => {
      if (sessionId && idToken) {
        try {
          const res = await fetch('/api/tickets/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ sessionId }),
          });
          const json = await res.json();
          if (res.ok) {
            setInfoMsg('チケットの購入が完了しました！');
          } else {
            setErrorMsg(json.error || '購入の確認に失敗しました');
          }
        } catch {
          setErrorMsg('購入の確認中に通信エラーが発生しました');
        }
      } else if (canceled) {
        setInfoMsg('購入をキャンセルしました');
      }
      // 未ログインで session_id を確定できなかった場合は残しておく（ログイン後に再確認）
      if ((sessionId && idToken) || canceled) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      await fetchAll();
    };
    run();
  }, [liffReady, idToken, authHeaders, fetchAll]);

  // ---- 操作 ----
  const requireLogin = (): boolean => {
    if (idToken) return true;
    if (needsLogin) {
      liff.login({ redirectUri: window.location.href });
    } else {
      setErrorMsg('LINEアプリから開いてください（LINEログインが必要です）');
    }
    return false;
  };

  const handleBuy = async (ev: LiveEvent) => {
    if (busyId || !requireLogin()) return;
    try {
      setBusyId(ev.id);
      setErrorMsg(null);
      setInfoMsg(null);
      const res = await fetch('/api/tickets/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ eventId: ev.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setErrorMsg(json.error || '購入手続きを開始できませんでした');
        setBusyId(null);
        return;
      }
      window.location.href = json.url;
    } catch {
      setErrorMsg('通信エラーが発生しました');
      setBusyId(null);
    }
  };

  const handleUseTicket = async (ticket: Ticket, ev: LiveEvent | undefined) => {
    if (busyId || !requireLogin()) return;
    const ok = window.confirm(
      `【入場】${ev?.title ?? 'チケット'}\nスタッフの前で押してください。\n一度使用すると元に戻せません。`
    );
    if (!ok) return;
    try {
      setBusyId(ticket.id);
      setErrorMsg(null);
      const res = await fetch(`/api/tickets/${ticket.id}/use`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || '入場処理に失敗しました');
        await fetchAll();
        return;
      }
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? json.ticket : t)));
      // 入場するとクーポンが1枚使えるようになるので、状態を取り直す
      await fetchAll();
      setInfoMsg('入場しました！ 🎁 クーポンを1枚使えるようになりました');
    } catch {
      setErrorMsg('通信エラーが発生しました');
    } finally {
      setBusyId(null);
    }
  };

  const handleUseCoupon = async (coupon: Coupon) => {
    if (coupon.is_used || busyId || !requireLogin()) return;
    if (entitlement?.state !== 'available') {
      setErrorMsg(entitlement?.message || 'いまはクーポンを使えません');
      return;
    }
    const ok = window.confirm(
      `【${coupon.shop_name}】\n「${coupon.benefit_title}」を使いますか？\n\n` +
        '・店員さんの前で押してください\n' +
        '・今回の入場で使えるクーポンは1枚だけです。使うと、ほかのお店のクーポンは次のイベントまで使えません\n' +
        '・一度使うと元に戻せません'
    );
    if (!ok) return;
    try {
      setBusyId(coupon.id);
      setErrorMsg(null);
      const res = await fetch(`/api/coupons/${coupon.id}/use`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || 'クーポンの使用処理に失敗しました');
        await fetchAll();
        return;
      }
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? json.coupon : c)));
      // 他のお店のクーポンもロックされるので、状態を取り直す
      await fetchAll();
    } catch {
      setErrorMsg('通信エラーが発生しました');
    } finally {
      setBusyId(null);
    }
  };

  // ---- 表示 ----
  const formatDeadline = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('ja-JP', {
          timeZone: 'Asia/Tokyo',
          month: 'numeric',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

  // クーポンの利用状況のお知らせ枠
  const entitlementBanner = () => {
    if (!entitlement) return null;
    const available = entitlement.state === 'available';
    return (
      <div
        style={{
          padding: 14,
          borderRadius: 12,
          border: available ? '1px solid #bbf7d0' : `1px solid ${COLORS.border}`,
          backgroundColor: available ? '#f0fdf4' : '#f8fafc',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {available ? (
          <>
            <div style={{ fontWeight: 700, color: COLORS.ok, fontSize: 15 }}>🎁 クーポンを1枚使えます</div>
            <div style={{ color: COLORS.sub }}>
              {entitlement.eventTitle ? `「${entitlement.eventTitle}」の入場特典です。` : ''}
              好きなお店を1つ選んでください（{formatDeadline(entitlement.deadline)}まで）。
            </div>
          </>
        ) : (
          <div style={{ color: COLORS.sub, fontWeight: 700 }}>{entitlement.message}</div>
        )}
      </div>
    );
  };
  const card: React.CSSProperties = {
    backgroundColor: '#ffffff',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 18,
  };

  const button = (disabled: boolean, done = false): React.CSSProperties => ({
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: done ? COLORS.muted : COLORS.primary,
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 15,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled && !done ? 0.7 : 1,
  });

  const badge = (used: boolean, usedLabel: string, okLabel: string) => (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 999,
        backgroundColor: used ? COLORS.border : COLORS.okBg,
        color: used ? COLORS.sub : COLORS.ok,
        whiteSpace: 'nowrap',
      }}
    >
      {used ? usedLabel : okLabel}
    </span>
  );

  const tabButton = (key: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      style={{
        flex: 1,
        padding: '10px 0',
        border: 'none',
        borderBottom: tab === key ? `3px solid ${COLORS.primary}` : '3px solid transparent',
        background: 'none',
        fontWeight: 700,
        fontSize: 15,
        color: tab === key ? COLORS.primaryDark : COLORS.muted,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  const notice = (text: string) => (
    <div
      style={{
        textAlign: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#f1f5f9',
        color: COLORS.sub,
        fontWeight: 700,
        fontSize: 14,
        lineHeight: 1.5,
        whiteSpace: 'pre-line',
      }}
    >
      {text}
    </div>
  );

  const saleBadge = (ev: LiveEvent) => {
    const map: Record<LiveEvent['sale_state'], { label: string; bg: string; color: string }> = {
      before: { label: '販売前', bg: COLORS.border, color: COLORS.sub },
      presale: { label: 'スポンサー先行', bg: '#fef3c7', color: '#b45309' },
      general: { label: '販売中', bg: COLORS.okBg, color: COLORS.ok },
      ended: { label: '販売終了', bg: COLORS.border, color: COLORS.sub },
    };
    const b = map[ev.sale_state];
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: 999,
          backgroundColor: b.bg,
          color: b.color,
          whiteSpace: 'nowrap',
        }}
      >
        {b.label}
      </span>
    );
  };

  const renderBuyArea = (ev: LiveEvent) => {
    if (ev.sale_state === 'ended') return notice('開演時刻を過ぎたため、販売を終了しました');
    if (ev.sale_state === 'before') {
      return notice(
        ev.presale_start
          ? `スポンサー先行販売：${formatDateTime(ev.presale_start)}〜` +
              (ev.general_sale_start ? `\n一般販売：${formatDateTime(ev.general_sale_start)}〜` : '')
          : ev.sale_opens_at
            ? `販売開始：${formatDateTime(ev.sale_opens_at)}〜`
            : 'まもなく販売開始'
      );
    }
    const presaleLocked = ev.sale_state === 'presale' && !isSponsor;
    return (
      <>
        {ev.sale_state === 'presale' && (
          <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 8px', lineHeight: 1.6 }}>
            ただいまスポンサー先行販売中です
            {ev.general_sale_start ? `（一般販売は${formatDateTime(ev.general_sale_start)}から）` : ''}。
            {presaleLocked && 'スポンサーの方はマイページの「LINEと連携する」から連携してください。'}
          </p>
        )}
        <button
          type="button"
          disabled={busyId === ev.id || presaleLocked}
          onClick={() => handleBuy(ev)}
          style={button(busyId === ev.id || presaleLocked, presaleLocked)}
        >
          {busyId === ev.id
            ? '決済ページへ移動中...'
            : presaleLocked
              ? 'スポンサー限定（先行販売中）'
              : `購入する ¥${ev.price_jpy.toLocaleString('ja-JP')}`}
        </button>
        {!presaleLocked && (
          <p style={{ fontSize: 11, color: COLORS.muted, margin: '8px 0 0', lineHeight: 1.6 }}>
            お客様都合のキャンセル・返金はできません（公演中止の場合は全額返金）。
            <a href={`${LEGAL_SITE}/tokushoho#ticket`} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.primary }}>
              特定商取引法に基づく表記
            </a>
          </p>
        )}
      </>
    );
  };

  const renderEntryArea = (ev: LiveEvent, ticket: Ticket) => {
    const now = Date.now();
    if (now < new Date(ev.entry_opens_at).getTime()) {
      return notice(`入場受付は ${formatDateTime(ev.entry_opens_at)} から（開演3時間前〜当日23:59）`);
    }
    if (now > new Date(ev.entry_closes_at).getTime()) {
      return notice('入場受付は終了しました');
    }
    return (
      <button
        type="button"
        disabled={busyId === ticket.id}
        onClick={() => handleUseTicket(ticket, ev)}
        style={button(busyId === ticket.id)}
      >
        {busyId === ticket.id ? '処理中...' : '入場する（スタッフの前で押す）'}
      </button>
    );
  };

  const renderTickets = () => {
    // チケットを持っていない終了済みの公演は出さない
    const list = events.filter((ev) => ev.sale_state !== 'ended' || tickets.some((t) => t.event_id === ev.id));
    if (list.length === 0) {
      return <div style={{ ...card, fontSize: 14, color: COLORS.sub }}>現在販売中の公演はありません。</div>;
    }
    return list.map((ev) => {
      const ticket = tickets.find((t) => t.event_id === ev.id);
      const used = ticket?.status === 'used';
      return (
        <section key={ev.id} style={{ ...card, opacity: used ? 0.75 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.primaryDark }}>
              {formatDateTime(ev.starts_at)} 開演
            </span>
            {ticket ? badge(used, '入場済み', '購入済み') : saleBadge(ev)}
          </div>
          <h2 style={{ fontSize: 18, margin: '0 0 4px', color: COLORS.text }}>{ev.title}</h2>
          <p style={{ fontSize: 13, color: COLORS.sub, margin: '0 0 6px' }}>📍 {ev.venue}</p>
          {ev.description && (
            <p style={{ fontSize: 13, color: COLORS.sub, margin: '0 0 14px', whiteSpace: 'pre-wrap' }}>
              {ev.description}
            </p>
          )}

          {!ticket && renderBuyArea(ev)}
          {ticket && !used && renderEntryArea(ev, ticket)}
          {ticket && used && notice(`入場済み（${formatDateTime(ticket.used_at)}）`)}
        </section>
      );
    });
  };

  const renderCoupons = () => {
    if (coupons.length === 0) {
      return (
        <div style={{ ...card, fontSize: 14, color: COLORS.sub }}>
          現在表示できるスポンサー店舗クーポンはありません。
        </div>
      );
    }
    const canUse = entitlement?.state === 'available';

    // 使えないときのボタン表示
    const lockedLabel = () => {
      switch (entitlement?.state) {
        case 'used':
        case 'expired':
          return '次のイベントで使えます';
        case 'not_entered':
          return 'ライブに入場すると使えます';
        default:
          return 'チケットをお持ちの方が使えます';
      }
    };

    return (
      <>
        {entitlementBanner()}
        {coupons.map((coupon) => {
          const locked = !coupon.is_used && !canUse;
          const disabled = coupon.is_used || locked || busyId === coupon.id;
          return (
            <section
              key={coupon.id}
              style={{
                ...card,
                border: coupon.is_used ? `1px solid #cbd5e1` : canUse ? '1px solid #bae6fd' : `1px solid ${COLORS.border}`,
                opacity: coupon.is_used || locked ? 0.72 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.primaryDark }}>{coupon.shop_name}</span>
                {coupon.is_used ? badge(true, '使用済み', '') : badge(!canUse, '利用不可', '利用可能')}
              </div>
              <h2 style={{ fontSize: 17, margin: '0 0 6px', color: COLORS.text }}>{coupon.benefit_title}</h2>
              <p style={{ fontSize: 13, color: COLORS.sub, margin: '0 0 14px' }}>{coupon.benefit_detail}</p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleUseCoupon(coupon)}
                style={button(disabled, coupon.is_used || locked)}
              >
                {coupon.is_used
                  ? `使用済み（${formatDateTime(coupon.used_at)}）`
                  : locked
                    ? lockedLabel()
                    : busyId === coupon.id
                      ? '処理中...'
                      : 'このお店で使う'}
              </button>
            </section>
          );
        })}
      </>
    );
  };

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 64px' }}>
      <header style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: COLORS.primary, margin: '0 0 4px' }}>
          NOBORIBETSU LIVE TICKET &amp; COUPON
        </p>
        <h1 style={{ fontSize: 22, margin: '0 0 6px', color: COLORS.text }}>ライブチケット＆クーポン</h1>
        <p style={{ fontSize: 13, color: COLORS.sub, margin: 0 }}>
          {displayName} さん ／ {liffStatus}
        </p>
      </header>

      {needsLogin && (
        <button
          type="button"
          onClick={() => liff.login({ redirectUri: window.location.href })}
          style={{ ...button(false), backgroundColor: '#06c755', marginBottom: 12 }}
        >
          LINEでログイン
        </button>
      )}

      <nav style={{ display: 'flex', borderBottom: `1px solid ${COLORS.border}`, marginBottom: 16 }}>
        {tabButton('tickets', '🎫 チケット')}
        {tabButton('coupons', '🎁 クーポン')}
      </nav>

      {infoMsg && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 8,
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: COLORS.ok,
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
            color: '#b91c1c',
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 14, color: COLORS.muted }}>読み込み中...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'tickets' && entitlement?.state === 'available' && (
            <button
              type="button"
              onClick={() => setTab('coupons')}
              style={{
                ...button(false),
                backgroundColor: '#f97316',
                textAlign: 'left',
                lineHeight: 1.5,
              }}
            >
              🎁 入場特典：お店のクーポンを1枚使えます（{formatDeadline(entitlement.deadline)}まで）▶
            </button>
          )}
          {tab === 'tickets' ? renderTickets() : renderCoupons()}
        </div>
      )}

      <footer style={{ marginTop: 28, textAlign: 'center', fontSize: 11, color: COLORS.muted, lineHeight: 1.8 }}>
        <a href={`${LEGAL_SITE}/tokushoho#ticket`} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.muted }}>
          特定商取引法に基づく表記
        </a>
        {' ／ '}
        <a href={`${LEGAL_SITE}/privacy`} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.muted }}>
          プライバシーポリシー
        </a>
        <div>© 外山企画</div>
      </footer>
    </main>
  );
}
