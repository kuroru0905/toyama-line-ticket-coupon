'use client';

import React, { useEffect, useState } from 'react';
import liff from '@line/liff';

// スポンサーマイページの「LINEと連携する」から開くページ
// https://liff.line.me/<LIFF_ID>/link?token=xxxx
type Phase = 'loading' | 'linking' | 'done' | 'error';

export default function LinkPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('確認しています...');
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setPhase('error');
      setMessage('LIFFの設定がありません（NEXT_PUBLIC_LIFF_ID）');
      return;
    }

    const run = async () => {
      try {
        await liff.init({ liffId });
      } catch {
        setPhase('error');
        setMessage('LINEの初期化に失敗しました。LINEアプリから開き直してください');
        return;
      }
      // liff.line.me 経由のクエリは init 後に復元される
      const token = new URLSearchParams(window.location.search).get('token');
      if (!token) {
        setPhase('error');
        setMessage('連携コードがありません。スポンサーマイページからもう一度お試しください');
        return;
      }
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = liff.getIDToken();
      if (!idToken) {
        setPhase('error');
        setMessage('LINEログイン情報を取得できませんでした');
        return;
      }

      setPhase('linking');
      setMessage('スポンサー契約と連携しています...');
      try {
        const res = await fetch('/api/sponsor-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (!res.ok) {
          setPhase('error');
          setMessage(json.error || '連携に失敗しました');
          return;
        }
        setSponsorName(json.sponsorName ?? null);
        setActive(Boolean(json.active));
        setPhase('done');
        setMessage('連携が完了しました！');
        window.history.replaceState(null, '', window.location.pathname);
      } catch {
        setPhase('error');
        setMessage('通信エラーが発生しました');
      }
    };
    run();
  }, []);

  const goHome = () => {
    window.location.href = '/';
  };

  return (
    <main className="app" style={{ paddingBottom: 32 }}>
      <header className="topbar">
        <h1>
          <span className="mark" aria-hidden />
          スポンサーのLINE連携
        </h1>
      </header>
      <div className="stack">
        {phase === 'error' ? (
          <div className="notice danger" role="alert">
            <strong>連携できませんでした</strong>
            {message}
          </div>
        ) : phase === 'done' ? (
          <div className="notice ok" role="status">
            <strong>連携が終わりました</strong>
            {sponsorName ? `「${sponsorName}」の` : ''}スポンサーとして、このLINEでスポンサー先行販売のチケットを買えます。
            {!active && (
              <>
                <br />
                いまはご契約の有効化前です。お支払いの確認後から先行購入できます。
              </>
            )}
          </div>
        ) : (
          <p className="empty">{message}</p>
        )}

        {(phase === 'done' || phase === 'error') && (
          <button type="button" className="btn" onClick={goHome}>
            チケット・クーポンを見る
          </button>
        )}
      </div>
    </main>
  );
}
