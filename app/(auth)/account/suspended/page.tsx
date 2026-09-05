// S_ACCOUNT_SUSPENDED: 停止中アカウント
// middleware がこの status のユーザーを唯一到達可能なルートとして閉じ込める
import { logOut } from '@/app/_actions/auth'
import { Button } from '@/components/ui/button'

export default function AccountSuspendedPage() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">アカウントは停止されています</h1>
      <p className="text-muted-foreground">
        利用規約に違反する行為が確認されたため、アカウントを停止しています。
      </p>
      <form action={logOut}>
        <Button type="submit" size="lg" variant="outline" className="mt-4">
          ログアウト
        </Button>
      </form>
    </div>
  )
}
