// ローカル Supabase の local_smtp (Mailpit) からテスト用にメールを取得する。
// E2E は実際にメールで届く6桁コードを読み取って入力する必要があるため
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

/** 指定の宛先に届いた最新メールから6桁の確認コードを取り出す。配信は非同期なのでポーリングする */
export async function fetchLatestOtp(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const searchRes = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    )
    const searchJson = (await searchRes.json()) as { messages?: { ID: string }[] }
    const latest = searchJson.messages?.[0]

    if (latest) {
      const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)
      const msg = (await msgRes.json()) as { Text?: string; HTML?: string }
      const match = /\b(\d{6})\b/.exec(msg.Text ?? msg.HTML ?? '')
      if (match?.[1]) return match[1]
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`${email} 宛の確認コードメールが見つからない（Mailpit: ${MAILPIT_URL}）`)
}
