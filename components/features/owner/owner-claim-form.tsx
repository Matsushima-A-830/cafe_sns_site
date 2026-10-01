'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState, useTransition } from 'react'
import { claimCafe } from '@/app/_actions/owner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { OWNER_DOCUMENT_MIN_COUNT, OWNER_DOCUMENT_TYPES } from '@/lib/constants/owner'
import { deleteOwnerDocumentFile, uploadOwnerDocument } from '@/lib/storage/owner-document-client'
import { errorMessage } from '@/lib/utils/error-messages'

const CONSENT_ITEMS = [
  { key: 'ownData', label: '提出情報は本人のものです' },
  { key: 'followReview', label: '審査結果に従います' },
  { key: 'extraContact', label: '運営から追加確認の連絡がある場合があることを理解しました' },
] as const
type ConsentKey = (typeof CONSENT_ITEMS)[number]['key']

type DocumentType = (typeof OWNER_DOCUMENT_TYPES)[number]['value']
type UploadedDocument = { type: DocumentType; path: string; fileName: string }

type Props = {
  cafeId: string
  cafeName: string
  rejectedReason: string | null
}

/**
 * S_OWNER_CLAIM のフォーム本体。verificationId はここで一度だけ生成し、
 * 同じ申請の書類アップロードすべてに使い回す（予約行を作らない設計。
 * docs/architecture/data-model/README.md #owner-documents-は予約行方式を使わない）
 */
export function OwnerClaimForm({ cafeId, cafeName, rejectedReason }: Props) {
  const router = useRouter()
  const [verificationId] = useState(() => crypto.randomUUID())
  const [documents, setDocuments] = useState<UploadedDocument[]>([])
  const [contactEmail, setContactEmail] = useState('')
  const [applicantNote, setApplicantNote] = useState('')
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({
    ownData: false,
    followReview: false,
    extraContact: false,
  })
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const countId = useId()
  const fileInputRefs = useRef<Partial<Record<DocumentType, HTMLInputElement | null>>>({})

  const allConsented = CONSENT_ITEMS.every((item) => consents[item.key])
  const canSubmit =
    documents.length >= OWNER_DOCUMENT_MIN_COUNT && contactEmail.trim() !== '' && allConsented

  async function handleFilesSelected(type: DocumentType, files: FileList | null) {
    // 送信中の追加を禁止する。isPending 中は documents が既に claimCafe に渡っており、
    // ここで追加してもクロージャで確定済みの送信には反映されず、Storage側だけの孤立ファイルになる
    if (isPending) return
    if (!files || files.length === 0) return
    setError(null)
    setUploadingType(type)

    for (const file of Array.from(files)) {
      const result = await uploadOwnerDocument(verificationId, file)
      if (!result.ok) {
        // FILE_TOO_LARGE/UNSUPPORTED_MEDIA_TYPE の共通メッセージは「画像」表記だが、
        // 書類は PDF も許可しているため専用の文言に差し替える
        setError(
          result.error === 'FILE_TOO_LARGE'
            ? 'ファイルのサイズが大きすぎます'
            : result.error === 'UNSUPPORTED_MEDIA_TYPE'
              ? 'この形式のファイルは使えません（画像またはPDFのみ）'
              : errorMessage(result.error),
        )
        continue
      }
      setDocuments((current) => [...current, { type, path: result.data.path, fileName: file.name }])
    }

    setUploadingType(null)
  }

  function handleRemove(index: number) {
    // 送信中の削除を禁止する。isPending 中は documents が既に claimCafe に渡っており、
    // ここでストレージ実削除すると DB 側だけ書類パスが残って不整合になる
    if (isPending) return

    const target = documents[index]
    setDocuments((current) => current.filter((_, i) => i !== index))
    // 孤立ファイルを増やさないためのベストエフォート削除。失敗してもフォームの選択状態は
    // 既に外れているので UI 側では握りつぶす（D50: 完全な防止はバッチ掃除で対応）
    if (target) void deleteOwnerDocumentFile(target.path)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (!canSubmit || isPending) return
    setError(null)

    startTransition(async () => {
      const result = await claimCafe({
        cafeId,
        documents: documents.map(({ type, path }) => ({ type, path })),
        contactEmail,
        applicantNote: applicantNote.trim() || undefined,
      })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      router.push('/owner/pending')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="rounded-lg border border-border-default bg-surface p-4">
        <p className="text-base font-bold text-foreground">{cafeName}</p>
      </div>

      {rejectedReason && (
        <div className="flex flex-col gap-1 rounded-lg border border-danger bg-danger/10 p-4">
          <p className="text-sm font-bold text-danger">前回の申請は却下されています</p>
          <p className="text-sm text-foreground">理由: {rejectedReason}</p>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold text-foreground">認証されると:</h2>
        <ul className="flex flex-col gap-1 pl-4 text-sm text-muted-foreground">
          <li>公式バッジが表示されます</li>
          <li>店舗情報を編集できます</li>
          <li>投稿分析ダッシュボードにアクセス</li>
          <li>ユーザーとのコミュニケーション</li>
        </ul>
      </section>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-base font-bold text-foreground">
          提出書類（以下から{OWNER_DOCUMENT_MIN_COUNT}点以上を選択）
        </legend>

        {OWNER_DOCUMENT_TYPES.map((option) => {
          const filesForType = documents
            .map((doc, index) => ({ ...doc, index }))
            .filter((doc) => doc.type === option.value)

          return (
            <div
              key={option.value}
              className="flex flex-col gap-2 rounded-lg border border-border-default p-4"
            >
              <div className="flex items-center gap-2">
                <Checkbox checked={filesForType.length > 0} disabled aria-hidden="true" />
                <span className="text-base text-foreground">{option.label}</span>
              </div>

              {filesForType.length > 0 && (
                <ul className="flex flex-col gap-1 pl-6">
                  {filesForType.map((doc) => (
                    <li
                      key={doc.path}
                      className="flex items-center justify-between gap-2 text-sm text-muted-foreground"
                    >
                      <span className="truncate">{doc.fileName}</span>
                      <button
                        type="button"
                        onClick={() => handleRemove(doc.index)}
                        // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
                        // 連打・送信中の削除は handleRemove 側の isPending ガードで止める
                        aria-busy={isPending}
                        className="shrink-0 text-sm text-danger underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <input
                ref={(el) => {
                  fileInputRefs.current[option.value] = el
                }}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  void handleFilesSelected(option.value, event.target.files)
                  event.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingType !== null}
                // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
                // 送信中の追加は handleFilesSelected 側の isPending ガードで止める（D61）
                aria-busy={isPending}
                onClick={() => fileInputRefs.current[option.value]?.click()}
                className="self-start"
              >
                {uploadingType === option.value ? 'アップロード中…' : '＋ アップロード'}
              </Button>
            </div>
          )
        })}
      </fieldset>

      <p id={countId} aria-live="polite" className="text-sm text-muted-foreground">
        選択済み: {documents.length} / {OWNER_DOCUMENT_MIN_COUNT} 必要
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="owner-claim-contact-email">連絡先メール</Label>
        <Input
          id="owner-claim-contact-email"
          type="email"
          required
          value={contactEmail}
          // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
          // 二重送信は handleSubmit 側の isPending ガードで止める
          aria-busy={isPending}
          onChange={(event) => setContactEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="owner-claim-note">補足事項（省略可能）</Label>
        <Textarea
          id="owner-claim-note"
          value={applicantNote}
          // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
          // 二重送信は handleSubmit 側の isPending ガードで止める
          aria-busy={isPending}
          maxLength={1000}
          placeholder="例: 屋号と本人氏名が異なる場合の説明等"
          onChange={(event) => setApplicantNote(event.target.value)}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">確認事項</legend>
        {CONSENT_ITEMS.map((item) => (
          <div key={item.key} className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              id={`owner-claim-consent-${item.key}`}
              checked={consents[item.key]}
              // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
              // 二重送信は handleSubmit 側の isPending ガードで止める
              aria-busy={isPending}
              onCheckedChange={(checked) =>
                setConsents((current) => ({ ...current, [item.key]: checked === true }))
              }
            />
            <Label htmlFor={`owner-claim-consent-${item.key}`}>{item.label}</Label>
          </div>
        ))}
      </fieldset>

      {error && (
        <p className="text-sm text-danger" role="alert" aria-live="polite">
          {error}
        </p>
      )}

      {/* 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。二重送信は handleSubmit 側の isPending ガードで止める */}
      <Button type="submit" size="lg" disabled={!canSubmit} aria-busy={isPending}>
        申請を送信する
      </Button>
      {documents.length < OWNER_DOCUMENT_MIN_COUNT && (
        <p className="text-center text-sm text-muted-foreground">
          ※ {OWNER_DOCUMENT_MIN_COUNT}点未選択の場合は送信不可
        </p>
      )}
    </form>
  )
}
