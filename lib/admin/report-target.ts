import type { SupabaseClient } from '@supabase/supabase-js'
import { postPlainText } from '@/lib/posts/post-detail'
import type { Database } from '@/types/database'

/**
 * S_ADMIN_REVIEW 用の通報対象の読み取り。
 *
 * getPostDetail / getCommentById / getPublicProfile はいずれも一般ユーザー向けの
 * 可視性フィルタ（status='published' / deleted_at is null / status='active'）を
 * 掛けており、通報対象こそまさにそのフィルタで弾かれる行（非表示・削除済み・停止済み）
 * であることが多い。admin セッションのクライアント（posts_select_admin /
 * comments_select_admin RLS で全件読める）で、フィルタ無しに直接読む
 *   docs/architecture/data-model/tables.md #reports
 */

type Client = SupabaseClient<Database>

export type ReportTargetSummary =
  | {
      type: 'post'
      id: string
      status: string
      deletedAt: string | null
      author: { id: string; username: string; displayName: string }
      bodyPreview: string
    }
  | {
      type: 'comment'
      id: string
      postId: string
      deletedAt: string | null
      author: { id: string; username: string; displayName: string }
      body: string
    }
  | {
      type: 'user'
      id: string
      username: string
      displayName: string
      status: string
    }
  | {
      type: 'cafe'
      id: string
      name: string
      status: string
    }

export async function getReportTargetSummary(
  supabase: Client,
  targetType: 'post' | 'comment' | 'user' | 'cafe',
  targetId: string,
): Promise<ReportTargetSummary | null> {
  switch (targetType) {
    case 'post': {
      const { data, error } = await supabase
        .from('posts')
        .select(
          'id, status, deleted_at, body_json, author:profiles!posts_author_id_fkey (id, username, display_name)',
        )
        .eq('id', targetId)
        .maybeSingle()
      if (error) throw new Error(`通報対象の投稿の取得に失敗しました: ${error.message}`)
      if (!data?.author) return null
      return {
        type: 'post',
        id: data.id,
        status: data.status,
        deletedAt: data.deleted_at,
        author: {
          id: data.author.id,
          username: data.author.username,
          displayName: data.author.display_name,
        },
        bodyPreview: postPlainText(data.body_json).slice(0, 200),
      }
    }
    case 'comment': {
      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, post_id, deleted_at, body, author:profiles!comments_author_id_fkey (id, username, display_name)',
        )
        .eq('id', targetId)
        .maybeSingle()
      if (error) throw new Error(`通報対象のコメントの取得に失敗しました: ${error.message}`)
      if (!data?.author) return null
      return {
        type: 'comment',
        id: data.id,
        postId: data.post_id,
        deletedAt: data.deleted_at,
        author: {
          id: data.author.id,
          username: data.author.username,
          displayName: data.author.display_name,
        },
        body: data.body,
      }
    }
    case 'user': {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, status')
        .eq('id', targetId)
        .maybeSingle()
      if (error) throw new Error(`通報対象のユーザーの取得に失敗しました: ${error.message}`)
      if (!data) return null
      return {
        type: 'user',
        id: data.id,
        username: data.username,
        displayName: data.display_name,
        status: data.status,
      }
    }
    case 'cafe': {
      const { data, error } = await supabase
        .from('cafes')
        .select('id, name, status')
        .eq('id', targetId)
        .maybeSingle()
      if (error) throw new Error(`通報対象のカフェの取得に失敗しました: ${error.message}`)
      if (!data) return null
      return { type: 'cafe', id: data.id, name: data.name, status: data.status }
    }
  }
}
