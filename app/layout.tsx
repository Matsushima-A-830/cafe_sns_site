import type { Metadata } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import './globals.css'

const notoSansJp = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  // 各ページは画面名だけを title に持たせ、サービス名はここで一律に付ける
  // （ページ側が文字列で上書きするとサービス名が消える）
  title: {
    default: 'カフェSNS',
    template: '%s | カフェSNS',
  },
  description: '気分で見つかる、行きつけと繋がる — カフェ好きのためのSNS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${notoSansJp.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
