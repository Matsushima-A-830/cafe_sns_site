// S_ONBOARD_INTERESTS: 好きな気分の選択（幹A）
// 詳細: docs/design/wireframes/auth.md#s_onboard_interests好きな気分の選択
import { createClient } from '@/lib/supabase/server'
import { InterestsForm } from './interests-form'

export default async function OnboardInterestsPage() {
  const supabase = await createClient()
  const { data: tags } = await supabase
    .from('tags')
    .select('id, label, category')
    .in('category', ['occasion', 'mood'])
    .order('priority', { ascending: false })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">どんなカフェ気分が好きですか？</h1>
        <p className="text-muted-foreground">(1〜5つ選んでください)</p>
      </div>
      <InterestsForm
        tags={(tags ?? []) as { id: string; label: string; category: 'occasion' | 'mood' }[]}
      />
    </div>
  )
}
