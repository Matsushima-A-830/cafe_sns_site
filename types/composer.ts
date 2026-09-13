/** composer（S_POST_SHORT / S_POST_BLOG）が扱う表示用の型。DB型は types/database.ts から派生する */

export type PostType = 'short' | 'blog'
export type PostVisibility = 'public' | 'followers'

export type ComposerTag = {
  id: string
  label: string
  category: 'occasion' | 'mood' | 'other'
}

export type ComposerCafe = {
  id: string
  name: string
  /** エリア名。未設定のカフェは「都道府県 + 市区町村」で代替する */
  areaLabel: string
}

/** アップロード済みの投稿画像。path は post_images.storage_path に入る値そのもの */
export type ComposerImage = {
  path: string
  previewUrl: string
}

/** 自動保存の状態表示（損失回避の可視化 — docs/design/wireframes/composer.md） */
export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error'
