import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Apple端末では SF Pro / ヒラギノ（システム書体）を優先。
// それ以外では英数字に Inter、日本語は端末の書体（Android は Noto Sans CJK、Windows は 游ゴシック）を使う。
// ※ Noto Sans JP を Google Fonts から読み込むと、ビルドが時々失敗する（取得エラー）ため読み込まない
const latin = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-latin' });

export const metadata: Metadata = {
  title: '登別ライブチケット＆クーポン | 外山企画',
  description: 'LINE公式アカウントでのチケット購入・発券・利用と、入場者特典のスポンサー店舗クーポン利用システム',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f5f5f7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={latin.variable}>
      <body>{children}</body>
    </html>
  );
}
