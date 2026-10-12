import type { Metadata } from 'next'
import { Epilogue, Noto_Sans_JP, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const notoSansJp = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
  display: 'swap',
})

// 和文はシステムの日本語フォントにフォールバックし、欧文・数字のみ上書きする
const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta-sans',
  subsets: ['latin'],
  display: 'swap',
})

const epilogue = Epilogue({
  variable: '--font-epilogue',
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  // 各ページは画面名だけを title に持たせ、サービス名はここで一律に付ける
  // （ページ側が文字列で上書きするとサービス名が消える）
  title: {
    default: 'ミツカフェ',
    template: '%s | ミツカフェ',
  },
  description: '気分で見つかる、行きつけと繋がる — カフェ好きのためのSNS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={`${notoSansJp.variable} ${plusJakartaSans.variable} ${epilogue.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
