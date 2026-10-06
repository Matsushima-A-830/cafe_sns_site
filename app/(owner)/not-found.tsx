// (owner) グループ全体（claim/pending/dashboard/edit/analytics/regulars）の 404。
// カフェ不存在・申請不存在・他人のカフェ（403を404化）を区別せず落とす（存在が漏れるため）
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils/error-messages'

export default function OwnerNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-foreground">{errorMessage('NOT_FOUND')}</h1>
      <p className="text-muted-foreground">
        ページが存在しないか、操作できる権限が無い可能性があります。
      </p>
      <Button asChild size="lg">
        <Link href="/me">マイページに戻る</Link>
      </Button>
    </div>
  )
}
