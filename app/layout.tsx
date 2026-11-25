import React from 'react';
import type { Metadata, Viewport } from 'next';
import { BIZ_UDPGothic, Barlow_Condensed } from 'next/font/google';
import './globals.css';

// 本文：モリサワのユニバーサルデザイン書体（スマホでも読みやすい）
const body = BIZ_UDPGothic({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
  preload: false,
});

// 日時・価格などの数字：チケットの印字のような細長い数字
const num = Barlow_Condensed({
  weight: ['500', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-num',
});

export const metadata: Metadata = {
  title: '登別ライブチケット＆クーポン | 外山企画',
  description: 'LINE公式アカウントでのチケット購入・発券・利用と、入場者特典のスポンサー店舗クーポン利用システム',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f5f7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${body.variable} ${num.variable}`}>
      <body>{children}</body>
    </html>
  );
}
