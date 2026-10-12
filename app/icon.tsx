import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// ブランドカラー（design-system.md brown-700/brown-50）を使った簡易ロゴ。
// 「ミツカフェ」の由来（見つかる＋蜜）にちなみ「蜜」の1文字を表示する
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#3E2723',
        color: '#FCF9F2',
        fontSize: 22,
        fontWeight: 700,
        borderRadius: 6,
      }}
    >
      蜜
    </div>,
    { ...size },
  )
}
