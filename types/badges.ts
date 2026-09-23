// docs/seed/badges-initial-set.md #判定タイミング
export type BadgeTrigger =
  | 'POST_CREATED'
  | 'REGULAR_AWARDED'
  | 'LIKE_RECEIVED'
  | 'LIKE_GIVEN'
  | 'FOLLOW_RECEIVED'

// badges.criteria の type 一覧（docs/seed/badges-initial-set.md #type一覧）
export type BadgeCriteria =
  | { type: 'post_count'; threshold: number }
  | {
      type: 'distinct_area_count'
      scope: { level: string; prefecture_code?: string }
      threshold: number
    }
  | { type: 'post_count_with_tag'; tag_slug: string; threshold: number }
  | { type: 'post_count_with_tags_or'; tag_slugs: string[]; threshold: number }
  | { type: 'distinct_scene_tag_count'; category: string; threshold: number }
  | { type: 'regular_customer_count'; threshold: number }
  | { type: 'follower_count'; threshold: number }
  | { type: 'likes_received'; threshold: number }
  | { type: 'likes_given'; threshold: number }
