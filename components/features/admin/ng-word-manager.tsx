'use client'

import { useId, useState, useTransition } from 'react'
import { addNgWord, deleteNgWord, type NgWordListItem } from '@/app/_actions/admin-ng-words'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NG_WORD_CATEGORY_LABELS, NG_WORD_SEVERITY_LABELS } from '@/lib/constants/admin-ng-words'
import { errorMessage } from '@/lib/utils/error-messages'

type Severity = keyof typeof NG_WORD_SEVERITY_LABELS
type Category = keyof typeof NG_WORD_CATEGORY_LABELS

function categoryLabel(category: string | null): string {
  if (category === null) return '未設定'
  return NG_WORD_CATEGORY_LABELS[category as Category] ?? category
}

/**
 * S_ADMIN_NG_WORDS の追加フォーム＋一覧。追加と削除を別コンポーネントに分けて
 * それぞれ `useState(initialItems)` を持たせると、追加フォームの成功後に
 * 一覧側の state が更新されない（router.refresh() は Server Component の
 * initialItems props を更新するが、一覧側は初回マウント時の値のまま）。
 * 1つの state を両方の操作で共有するため、あえて1コンポーネントにまとめる
 * （CLAUDE.md「過剰設計を避ける」= 素朴な分割よりバグらない構造を優先）
 *   docs/product/pending-items.md B4
 */
export function NgWordManager({ initialItems }: { initialItems: NgWordListItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [word, setWord] = useState('')
  const [severity, setSeverity] = useState<Severity>('block')
  const [category, setCategory] = useState<Category | ''>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<NgWordListItem | null>(null)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()
  const wordId = useId()
  const severityId = useId()
  const categoryId = useId()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    const trimmedWord = word.trim()
    const selectedCategory = category || undefined

    startTransition(async () => {
      const result = await addNgWord({ word: trimmedWord, severity, category: selectedCategory })
      if (!result.ok) {
        setFormError(errorMessage(result.error))
        return
      }
      // listNgWords は word 昇順（citext 比較）で返す。追加時もその順序を保つ
      const newItem: NgWordListItem = {
        id: result.data.ngWordId,
        word: trimmedWord,
        severity,
        category: selectedCategory ?? null,
        createdAt: new Date().toISOString(),
      }
      setItems((current) =>
        [...current, newItem].sort((a, b) =>
          a.word.localeCompare(b.word, 'ja', { sensitivity: 'base' }),
        ),
      )
      setWord('')
      setCategory('')
      setStatus(`「${trimmedWord}」を追加しました`)
    })
  }

  function handleConfirmDelete() {
    const target = pendingDelete
    if (!target) return

    const previous = items
    setItems((current) => current.filter((item) => item.id !== target.id))
    setPendingDelete(null)
    setListError(null)

    startTransition(async () => {
      const result = await deleteNgWord({ ngWordId: target.id })
      if (!result.ok) {
        setItems(previous)
        setListError(errorMessage(result.error))
        return
      }
      setStatus(`「${target.word}」を削除しました`)
    })
  }

  const selectClassName =
    'flex h-10 w-full min-w-0 rounded-md border border-border-input bg-input px-3 py-2 text-base text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring-focus focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-lg border border-border-default bg-surface p-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={wordId}>単語</Label>
          <Input
            id={wordId}
            value={word}
            disabled={isPending}
            maxLength={100}
            required
            onChange={(event) => setWord(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={severityId}>severity</Label>
            <select
              id={severityId}
              value={severity}
              disabled={isPending}
              onChange={(event) => setSeverity(event.target.value as Severity)}
              className={selectClassName}
            >
              {(Object.keys(NG_WORD_SEVERITY_LABELS) as Severity[]).map((value) => (
                <option key={value} value={value}>
                  {NG_WORD_SEVERITY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={categoryId}>category（任意）</Label>
            <select
              id={categoryId}
              value={category}
              disabled={isPending}
              onChange={(event) => setCategory(event.target.value as Category | '')}
              className={selectClassName}
            >
              <option value="">未設定</option>
              {(Object.keys(NG_WORD_CATEGORY_LABELS) as Category[]).map((value) => (
                <option key={value} value={value}>
                  {NG_WORD_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {formError && (
          <p className="text-sm text-danger" role="alert" aria-live="polite">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={isPending || word.trim().length === 0}>
          追加する
        </Button>
      </form>

      <p aria-live="polite" className="sr-only">
        {isPending ? '処理中' : status}
      </p>

      {items.length === 0 ? (
        <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
          登録されているNGワードはありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border-default bg-surface p-4"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-bold text-foreground">{item.word}</span>
                <span className="text-sm text-muted-foreground">
                  {NG_WORD_SEVERITY_LABELS[item.severity]} / {categoryLabel(item.category)}
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setPendingDelete(item)}
                className="focus-visible:ring-2 focus-visible:ring-ring-focus"
              >
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}

      {listError && (
        <p className="text-sm text-danger" role="alert">
          {listError}
        </p>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>「{pendingDelete?.word}」を削除しますか？</DialogTitle>
          <DialogDescription>削除すると、この単語は以後検出されなくなります。</DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setPendingDelete(null)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={isPending}
              onClick={handleConfirmDelete}
            >
              削除する
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
