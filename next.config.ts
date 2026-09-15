import type { NextConfig } from 'next'

// 画像は Supabase Storage が正 (docs/product/pending-items.md A5)。
// S3 + CloudFront へ移行する際はここにドメインを追加する。
// ローカルは http://127.0.0.1:54321 なので protocol も URL から拾う。
function supabaseImagePattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return []
  try {
    const { protocol, hostname, port } = new URL(raw)
    return [
      {
        protocol: protocol.replace(':', '') as 'http' | 'https',
        hostname,
        port,
        pathname: '/storage/v1/object/public/**',
      },
    ]
  } catch {
    // 不正な URL でビルドを止めない。値の検証は lib/env.ts の Zod が行う
    return []
  }
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function isLocalSupabase() {
  try {
    return LOCAL_HOSTS.has(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname)
  } catch {
    return false
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImagePattern(),
    // Next.js 16 は SSRF 対策として private IP からの画像取得を拒否する
    // （`upstream image ... resolved to private IP`）。ローカル Supabase は 127.0.0.1 なので、
    // 配信元がローカルのときだけ許可する。NODE_ENV ではなく配信元で判定するのは、
    // 手元で `pnpm build && pnpm start` した場合も画像を見られるようにするため
    dangerouslyAllowLocalIP: isLocalSupabase(),
  },
}

export default nextConfig
