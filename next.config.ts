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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImagePattern(),
  },
}

export default nextConfig
