// S_POST_SUCCESS: 投稿完了
// 詳細: docs/design/wireframes/composer.md#s_post_success投稿完了
import { CheckIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function PostSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ postId?: string }>
}) {
  const { postId } = await searchParams

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-6 px-4 py-16 text-center">
      {/* ピークエンド則: 完了時に軽い動きを付ける。prefers-reduced-motion では止める */}
      <div className="flex size-16 items-center justify-center rounded-full bg-success text-success-foreground motion-safe:animate-bounce">
        <CheckIcon className="size-8" aria-hidden="true" />
      </div>

      <h1 className="text-2xl font-bold text-foreground">投稿しました！</h1>
      <p className="text-muted-foreground">
        この投稿はエリアの制覇マップに反映されます。続けて投稿することもできます。
      </p>

      <div className="flex w-full flex-col gap-2">
        {postId && (
          <Button asChild size="lg">
            <Link href={`/posts/${postId}`}>投稿を見る</Link>
          </Button>
        )}
        <Button asChild variant="outline" size="lg">
          <Link href="/new">続けて投稿する</Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href="/">ホームに戻る</Link>
        </Button>
      </div>
    </div>
  )
}
