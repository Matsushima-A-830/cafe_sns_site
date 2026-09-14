// S_POST_DETAIL の 404。削除済み・非公開・存在しないIDはすべてここへ落とす
// （区別して伝えると「その投稿が存在すること」自体が漏れる）
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils/error-messages'

export default function PostNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-foreground">{errorMessage('POST_NOT_FOUND')}</h1>
      <p className="text-muted-foreground">削除されたか、公開範囲が変更された可能性があります。</p>
      <Button asChild size="lg">
        <Link href="/">ホームに戻る</Link>
      </Button>
    </div>
  )
}
