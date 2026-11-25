'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

// 取り消せない操作は、下から出る確認シートで念押しする
type Confirm =
  | { kind: 'entry'; ticket: Ticket; event: LiveEvent | undefined }
  | { kind: 'coupon'; coupon: Coupon };

// 特商法・プライバシーポリシーはスポンサーサイトに一本化
const LEGAL_SITE = process.env.NEXT_PUBLIC_SPONSOR_SITE_URL || 'https://toyama-sponsor-hub.vercel.app';

const TZ = { timeZone: 'Asia/Tokyo' } as const;
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { ...TZ, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { ...TZ, month: 'numeric', day: 'numeric' });
const fmtWeek = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { ...TZ, weekday: 'short' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { ...TZ, hour: '2-digit', minute: '2-digit' });
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 指（またはカーソル）の位置に合わせてチケットが傾き、青い光が追いかける。離すと滑って戻る
const tiltHandlers = {
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
    if (reducedMotion()) return;
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.dataset.active = 'true';
    el.style.transform = `perspective(900px) rotateX(${((0.5 - py) * 8).toFixed(2)}deg) rotateY(${((px - 0.5) * 8).toFixed(2)}deg)`;
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
  },
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return;
    tiltHandlers.onPointerMove({ ...e, buttons: 1 } as React.PointerEvent<HTMLElement>);
  },
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.dataset.active = 'false';
    e.currentTarget.style.transform = '';
  },
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return;
    e.currentTarget.dataset.active = 'false';
    e.currentTarget.style.transform = '';
  },
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.dataset.active = 'false';
    e.currentTarget.style.transform = '';
  },
};

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('tickets');
  const [liffReady, setLiffReady] = useState(false);
  const [liffError, setLiffError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [entitlement, setEntitlement] = useState<CouponEntitlement | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isSponsor, setIsSponsor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [glide, setGlide] = useState<'' | 'glide-from-right' | 'glide-from-left'>('');
  const paneRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; dx: number; locked: 'x' | 'y' | null } | null>(null);

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
      setLiffError('LIFFの設定がありません（NEXT_PUBLIC_LIFF_ID）');
      setLiffReady(true);
      return;
    }

    liff
      .init({ liffId })
      .then(async () => {
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
      .catch(() => setLiffError('LINEとの接続に失敗しました。LINEアプリから開き直してください'))
      .finally(() => {
        readTab();
        setLiffReady(true);
      });
  }, []);

  const authHeaders = useCallback((): HeadersInit => (idToken ? { Authorization: `Bearer ${idToken}` } : {}), [idToken]);

  // ---- データ取得 ----
  const fetchAll = useCallback(async () => {
    try {
      const [cRes, tRes] = await Promise.all([
        fetch('/api/coupons', { cache: 'no-store', headers: authHeaders() }),
        fetch('/api/tickets', { cache: 'no-store', headers: authHeaders() }),
      ]);
      const cJson = await cRes.json();
      const tJson = await tRes.json();
      if (!cRes.ok) throw new Error(cJson.error || 'クーポンを読み込めませんでした');
      if (!tRes.ok) throw new Error(tJson.error || 'チケットを読み込めませんでした');
      setCoupons(cJson.coupons ?? []);
      setEntitlement(cJson.entitlement ?? null);
      setEvents(tJson.events ?? []);
      setTickets(tJson.tickets ?? []);
      setIsSponsor(Boolean(tJson.isSponsor));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '通信できませんでした。電波の良いところで開き直してください');
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
          if (res.ok) setInfoMsg('チケットを購入しました。当日は、このチケットを会場のスタッフに見せてください。');
          else setErrorMsg(json.error || '購入を確認できませんでした');
        } catch {
          setErrorMsg('購入の確認中に通信が切れました。少し待ってから開き直してください');
        }
      } else if (canceled) {
        setInfoMsg('購入を取りやめました。');
      }
      // 未ログインで session_id を確定できなかった場合は残しておく（ログイン後に再確認）
      if ((sessionId && idToken) || canceled) window.history.replaceState(null, '', window.location.pathname);
      await fetchAll();
    };
    run();
  }, [liffReady, idToken, authHeaders, fetchAll]);

  // 確認シートを開いている間はEscで閉じる
  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyId) setConfirm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, busyId]);

  // ---- 操作 ----
  const requireLogin = (): boolean => {
    if (idToken) return true;
    if (needsLogin) liff.login({ redirectUri: window.location.href });
    else setErrorMsg('LINEアプリから開いてください（LINEログインが必要です）');
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
        setErrorMsg(json.error || '購入の手続きを始められませんでした');
        setBusyId(null);
        return;
      }
      window.location.href = json.url;
    } catch {
      setErrorMsg('通信できませんでした');
      setBusyId(null);
    }
  };

  const doEntry = async (ticket: Ticket) => {
    try {
      setBusyId(ticket.id);
      setErrorMsg(null);
      const res = await fetch(`/api/tickets/${ticket.id}/use`, { method: 'POST', headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || '入場の処理ができませんでした');
        await fetchAll();
        return;
      }
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? json.ticket : t)));
      // 入場するとクーポンが1枚使えるようになるので、状態を取り直す
      await fetchAll();
      setInfoMsg('入場しました。入場特典として、お店のクーポンが1枚使えます。');
    } catch {
      setErrorMsg('通信できませんでした');
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  };

  const doCoupon = async (coupon: Coupon) => {
    try {
      setBusyId(coupon.id);
      setErrorMsg(null);
      const res = await fetch(`/api/coupons/${coupon.id}/use`, { method: 'POST', headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || 'クーポンを使えませんでした');
        await fetchAll();
        return;
      }
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? json.coupon : c)));
      // 他のお店のクーポンもロックされるので、状態を取り直す
      await fetchAll();
      setInfoMsg(`「${coupon.benefit_title}」を使いました。この画面をお店の人に見せてください。`);
    } catch {
      setErrorMsg('通信できませんでした');
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  };

  const askEntry = (ticket: Ticket, ev: LiveEvent | undefined) => {
    if (busyId || !requireLogin()) return;
    setConfirm({ kind: 'entry', ticket, event: ev });
  };

  const askCoupon = (coupon: Coupon) => {
    if (coupon.is_used || busyId || !requireLogin()) return;
    if (entitlement?.state !== 'available') {
      setErrorMsg(entitlement?.message || 'いまはクーポンを使えません');
      return;
    }
    setConfirm({ kind: 'coupon', coupon });
  };

  const switchTab = (t: Tab) => {
    if (t === tab) return;
    setGlide(t === 'coupons' ? 'glide-from-right' : 'glide-from-left');
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  // 左右スワイプでチケット⇄クーポン。指についてくるように少しずれて、離すと滑って切り替わる
  const onTouchStart = (e: React.TouchEvent) => {
    if (confirm) return;
    const t = e.touches[0];
    swipe.current = { x: t.clientX, y: t.clientY, dx: 0, locked: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.locked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) s.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (s.locked !== 'x') return;
    // 端の方向（チケットで右、クーポンで左）は少しだけ動かして「これ以上ない」ことを伝える
    const edge = (tab === 'tickets' && dx > 0) || (tab === 'coupons' && dx < 0);
    s.dx = dx;
    const el = paneRef.current;
    if (el && !reducedMotion()) {
      el.style.transition = 'none';
      el.style.transform = `translateX(${(edge ? dx * 0.12 : dx * 0.35).toFixed(1)}px)`;
    }
  };
  const onTouchEnd = () => {
    const s = swipe.current;
    swipe.current = null;
    const el = paneRef.current;
    if (el) {
      el.style.transition = 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform = '';
    }
    if (!s || s.locked !== 'x') return;
    if (s.dx < -60 && tab === 'tickets') switchTab('coupons');
    else if (s.dx > 60 && tab === 'coupons') switchTab('tickets');
  };

  // ---- 表示部品 ----
  const saleBadge = (ev: LiveEvent) => {
    const map: Record<LiveEvent['sale_state'], { label: string; cls: string }> = {
      before: { label: '販売前', cls: '' },
      presale: { label: 'スポンサー先行', cls: 'warn' },
      general: { label: '販売中', cls: 'ok' },
      ended: { label: '販売終了', cls: '' },
    };
    const b = map[ev.sale_state];
    return <span className={`badge ${b.cls}`}>{b.label}</span>;
  };

  const renderBuyArea = (ev: LiveEvent) => {
    if (ev.sale_state === 'ended') return <p className="muted">開演時刻を過ぎたので、販売を終えました。</p>;
    if (ev.sale_state === 'before') {
      return (
        <div className="muted">
          {ev.presale_start ? (
            <>
              スポンサー先行販売 <span className="num" style={{ fontSize: 17, color: 'var(--ink)' }}>{fmtDateTime(ev.presale_start)}</span> から
              {ev.general_sale_start && (
                <>
                  <br />
                  一般販売 <span className="num" style={{ fontSize: 17, color: 'var(--ink)' }}>{fmtDateTime(ev.general_sale_start)}</span> から
                </>
              )}
            </>
          ) : ev.sale_opens_at ? (
            <>
              販売開始 <span className="num" style={{ fontSize: 17, color: 'var(--ink)' }}>{fmtDateTime(ev.sale_opens_at)}</span> から
            </>
          ) : (
            'まもなく販売を始めます'
          )}
        </div>
      );
    }
    const presaleLocked = ev.sale_state === 'presale' && !isSponsor;
    return (
      <>
        {ev.sale_state === 'presale' && (
          <p className="muted" style={{ margin: '0 0 10px' }}>
            いまはスポンサー先行販売の期間です
            {ev.general_sale_start ? `（一般販売は${fmtDateTime(ev.general_sale_start)}から）` : ''}。
            {presaleLocked && 'スポンサーの方は、マイページの「LINEと連携する」を済ませると買えます。'}
          </p>
        )}
        <button type="button" className="btn" disabled={busyId === ev.id || presaleLocked} onClick={() => handleBuy(ev)}>
          {busyId === ev.id ? '決済の画面へ移動しています…' : presaleLocked ? 'スポンサー限定の期間です' : `${yen(ev.price_jpy)}で購入する`}
        </button>
        {!presaleLocked && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, textAlign: 'center' }}>
            お客様都合のキャンセル・返金はできません（公演中止の場合は全額返金）。
            <a href={`${LEGAL_SITE}/tokushoho#ticket`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>
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
      return (
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
          入場の受付は <span className="num" style={{ fontSize: 17, color: 'var(--ink)' }}>{fmtDateTime(ev.entry_opens_at)}</span> から
          <br />
          （開演3時間前から当日23:59まで）
        </p>
      );
    }
    if (now > new Date(ev.entry_closes_at).getTime()) return <p className="muted" style={{ margin: 0, textAlign: 'center' }}>入場の受付は終わりました。</p>;
    return (
      <>
        <button type="button" className="btn" disabled={busyId === ticket.id} onClick={() => askEntry(ticket, ev)}>
          入場する
        </button>
        <p className="hint">会場のスタッフの前で押してください</p>
      </>
    );
  };

  const renderTickets = () => {
    // チケットを持っていない終了済みの公演は出さない
    const list = events.filter((ev) => ev.sale_state !== 'ended' || tickets.some((t) => t.event_id === ev.id));
    if (list.length === 0) return <p className="empty">いま販売しているライブはありません。決まったら公式LINEでお知らせします。</p>;
    return list.map((ev) => {
      const ticket = tickets.find((t) => t.event_id === ev.id);
      const used = ticket?.status === 'used';
      return (
        <article key={ev.id} className="ticket tilt" aria-label={ev.title} data-active="false" {...tiltHandlers}>
          <div className="ticket-body">
            <div className="ticket-head">
              <span className="muted">{ticket ? 'あなたのチケット' : 'ライブ'}</span>
              {ticket ? <span className={`badge ${used ? '' : 'brand'}`}>{used ? '入場済み' : '購入済み'}</span> : saleBadge(ev)}
            </div>
            <h2 className="ticket-title">{ev.title}</h2>
            <div className="muted">{ev.venue}</div>
            <dl className="ticket-meta">
              <div>
                <dt>日付</dt>
                <dd className="num">
                  {fmtDay(ev.starts_at)}
                  <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 4, color: 'var(--ink-2)' }}>{fmtWeek(ev.starts_at)}</span>
                </dd>
              </div>
              <div>
                <dt>開演</dt>
                <dd className="num">{fmtTime(ev.starts_at)}</dd>
              </div>
              <div>
                <dt>料金</dt>
                <dd className="num">{yen(ev.price_jpy)}</dd>
              </div>
            </dl>
            {ev.description && !ticket && <p className="ticket-desc">{ev.description}</p>}
          </div>
          <div className="perf" />
          <div className="stub">
            {!ticket && renderBuyArea(ev)}
            {ticket && !used && renderEntryArea(ev, ticket)}
            {ticket && used && (
              <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
                <span className="num" style={{ fontSize: 17, color: 'var(--ink)' }}>{fmtDateTime(ticket.used_at)}</span> に入場しました
              </p>
            )}
          </div>
        </article>
      );
    });
  };

  const entitlementNotice = () => {
    if (!entitlement) return null;
    if (entitlement.state === 'available') {
      return (
        <div className="notice warn">
          <strong>お店のクーポンが1枚使えます</strong>
          {entitlement.eventTitle ? `「${entitlement.eventTitle}」の入場特典です。` : ''}
          好きなお店を1つ選んでください。<span className="num" style={{ fontSize: 16 }}>{fmtDateTime(entitlement.deadline)}</span> まで使えます。
        </div>
      );
    }
    return <div className="notice">{entitlement.message}</div>;
  };

  const renderCoupons = () => {
    const canUse = entitlement?.state === 'available';
    const lockedLabel = () => {
      switch (entitlement?.state) {
        case 'used':
        case 'expired':
          return '次のライブで使えます';
        case 'not_entered':
          return 'ライブに入場すると使えます';
        default:
          return 'チケットを持っている方が使えます';
      }
    };
    return (
      <>
        {entitlementNotice()}
        {coupons.length === 0 && <p className="empty">いま使えるクーポンはありません。</p>}
        {coupons.map((coupon) => {
          const locked = !coupon.is_used && !canUse;
          return (
            <section key={coupon.id} className={`coupon ${coupon.is_used ? 'used' : ''}`} aria-label={`${coupon.shop_name}のクーポン`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="shop">{coupon.shop_name}</span>
                {coupon.is_used ? <span className="badge">使用済み</span> : canUse ? <span className="badge ok">使えます</span> : null}
              </div>
              <h3>{coupon.benefit_title}</h3>
              <p>{coupon.benefit_detail}</p>
              {coupon.is_used ? (
                <p className="muted" style={{ margin: 0 }}>
                  <span className="num" style={{ fontSize: 16, color: 'var(--ink)' }}>{fmtDateTime(coupon.used_at)}</span> に使いました
                </p>
              ) : locked ? (
                <button type="button" className="btn secondary" disabled>
                  {lockedLabel()}
                </button>
              ) : (
                <button type="button" className="btn accent" disabled={busyId === coupon.id} onClick={() => askCoupon(coupon)}>
                  このお店で使う
                </button>
              )}
            </section>
          );
        })}
      </>
    );
  };

  const renderConfirm = () => {
    if (!confirm) return null;
    const busy = Boolean(busyId);
    const isEntry = confirm.kind === 'entry';
    return (
      <div className="sheet-backdrop" onClick={() => !busy && setConfirm(null)}>
        <div
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={(e) => e.stopPropagation()}
        >
          {isEntry ? (
            <>
              <h2 id="confirm-title">入場しますか？</h2>
              <div className="big">
                <div style={{ fontWeight: 700, fontSize: 17 }}>{confirm.event?.title ?? 'チケット'}</div>
                {confirm.event && <div className="muted">{confirm.event.venue}</div>}
              </div>
              <ul>
                <li>会場のスタッフの前で押してください。</li>
                <li>一度押すと元に戻せません。</li>
              </ul>
              <div className="actions">
                <button type="button" className="btn" disabled={busy} onClick={() => doEntry(confirm.ticket)}>
                  {busy ? '処理しています…' : '入場する'}
                </button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => setConfirm(null)}>
                  やめる
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="confirm-title">このクーポンを使いますか？</h2>
              <div className="big">
                <div className="muted">{confirm.coupon.shop_name}</div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{confirm.coupon.benefit_title}</div>
              </div>
              <ul>
                <li>お店の人の前で押してください。</li>
                <li>今回の入場で使えるのは1枚だけです。使うと、ほかのお店のクーポンは次のライブまで使えません。</li>
                <li>一度使うと元に戻せません。</li>
              </ul>
              <div className="actions">
                <button type="button" className="btn accent" disabled={busy} onClick={() => doCoupon(confirm.coupon)}>
                  {busy ? '処理しています…' : 'このお店で使う'}
                </button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => setConfirm(null)}>
                  やめる
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const couponAvailable = entitlement?.state === 'available';

  return (
    <>
      <main className="app">
        <header className="topbar">
          <h1>
            <span className="mark" aria-hidden />
            {tab === 'tickets' ? 'チケット' : 'クーポン'}
          </h1>
          {displayName && <span className="who">{displayName} さん</span>}
        </header>

        <div className="stack swipe-area" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
          {liffError && <div className="notice danger">{liffError}</div>}

          {needsLogin && (
            <button type="button" className="btn" style={{ background: '#06c755', borderColor: '#06c755' }} onClick={() => liff.login({ redirectUri: window.location.href })}>
              LINEでログインする
            </button>
          )}

          {infoMsg && <div className="notice ok" role="status">{infoMsg}</div>}
          {errorMsg && <div className="notice danger" role="alert">{errorMsg}</div>}

          {loading ? (
            <p className="empty">読み込んでいます…</p>
          ) : (
            <div ref={paneRef} key={tab} className={`pane stack ${glide}`} onAnimationEnd={() => setGlide('')}>
              {tab === 'tickets' && couponAvailable && (
                <button type="button" className="btn accent" onClick={() => switchTab('coupons')}>
                  入場特典のクーポンを選ぶ
                </button>
              )}
              {tab === 'tickets' ? renderTickets() : renderCoupons()}
              <p className="muted" style={{ textAlign: 'center', margin: 0, fontSize: 12 }}>
                左右にスワイプしても、チケットとクーポンを切り替えられます
              </p>
            </div>
          )}
        </div>

        <footer className="footer">
          <a href={`${LEGAL_SITE}/tokushoho#ticket`} target="_blank" rel="noopener noreferrer">
            特定商取引法に基づく表記
          </a>
          {'　'}
          <a href={`${LEGAL_SITE}/privacy`} target="_blank" rel="noopener noreferrer">
            プライバシーポリシー
          </a>
          <div>外山企画</div>
        </footer>
      </main>

      <nav className="tabbar" aria-label="画面の切り替え">
        <div className="tabbar-inner" role="tablist">
          <button type="button" role="tab" className="tab" aria-selected={tab === 'tickets'} onClick={() => switchTab('tickets')}>
            チケット
          </button>
          <button type="button" role="tab" className="tab" aria-selected={tab === 'coupons'} onClick={() => switchTab('coupons')}>
            クーポン
            {couponAvailable && <span className="dot" aria-label="使えるクーポンがあります" />}
          </button>
        </div>
      </nav>

      {renderConfirm()}
    </>
  );
}
