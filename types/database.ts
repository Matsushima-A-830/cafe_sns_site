export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      area_visits: {
        Row: {
          area_code: string
          first_visited_at: string
          last_visited_at: string
          user_id: string
          visit_count: number
        }
        Insert: {
          area_code: string
          first_visited_at: string
          last_visited_at: string
          user_id: string
          visit_count?: number
        }
        Update: {
          area_code?: string
          first_visited_at?: string
          last_visited_at?: string
          user_id?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: 'area_visits_area_code_fkey'
            columns: ['area_code']
            isOneToOne: false
            referencedRelation: 'areas'
            referencedColumns: ['code']
          },
          {
            foreignKeyName: 'area_visits_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      areas: {
        Row: {
          center_location: unknown
          code: string
          created_at: string
          is_active: boolean
          label: string
          label_kana: string | null
          level: string
          parent_code: string | null
          prefecture_code: string
          priority: number
          slug: string
        }
        Insert: {
          center_location?: unknown
          code: string
          created_at?: string
          is_active?: boolean
          label: string
          label_kana?: string | null
          level: string
          parent_code?: string | null
          prefecture_code: string
          priority?: number
          slug: string
        }
        Update: {
          center_location?: unknown
          code?: string
          created_at?: string
          is_active?: boolean
          label?: string
          label_kana?: string | null
          level?: string
          parent_code?: string | null
          prefecture_code?: string
          priority?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: 'areas_parent_code_fkey'
            columns: ['parent_code']
            isOneToOne: false
            referencedRelation: 'areas'
            referencedColumns: ['code']
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      badges: {
        Row: {
          code: string
          created_at: string
          criteria: Json
          description: string | null
          icon_url: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          criteria: Json
          description?: string | null
          icon_url?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          criteria?: Json
          description?: string | null
          icon_url?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'blocks_blocked_id_fkey'
            columns: ['blocked_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey'
            columns: ['blocker_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      cafe_business_hours: {
        Row: {
          cafe_id: string
          closes_at: string | null
          day_of_week: number
          is_closed: boolean
          notes: string | null
          opens_at: string | null
        }
        Insert: {
          cafe_id: string
          closes_at?: string | null
          day_of_week: number
          is_closed?: boolean
          notes?: string | null
          opens_at?: string | null
        }
        Update: {
          cafe_id?: string
          closes_at?: string | null
          day_of_week?: number
          is_closed?: boolean
          notes?: string | null
          opens_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cafe_business_hours_cafe_id_fkey'
            columns: ['cafe_id']
            isOneToOne: false
            referencedRelation: 'cafes'
            referencedColumns: ['id']
          },
        ]
      }
      cafe_congestion_reports: {
        Row: {
          cafe_id: string
          id: string
          level: number
          reported_at: string
          user_id: string
        }
        Insert: {
          cafe_id: string
          id?: string
          level: number
          reported_at?: string
          user_id: string
        }
        Update: {
          cafe_id?: string
          id?: string
          level?: number
          reported_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cafe_congestion_reports_cafe_id_fkey'
            columns: ['cafe_id']
            isOneToOne: false
            referencedRelation: 'cafes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cafe_congestion_reports_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      cafe_owner_verifications: {
        Row: {
          applicant_note: string | null
          cafe_id: string
          contact_email: string
          created_at: string
          document_urls: Json
          id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          applicant_note?: string | null
          cafe_id: string
          contact_email: string
          created_at?: string
          document_urls?: Json
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          applicant_note?: string | null
          cafe_id?: string
          contact_email?: string
          created_at?: string
          document_urls?: Json
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cafe_owner_verifications_cafe_id_fkey'
            columns: ['cafe_id']
            isOneToOne: false
            referencedRelation: 'cafes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cafe_owner_verifications_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cafe_owner_verifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      cafes: {
        Row: {
          address: string | null
          area_code: string | null
          city: string
          created_at: string
          created_by: string | null
          description: string | null
          external_ids: Json
          id: string
          location: unknown
          main_image_path: string | null
          metadata: Json
          name: string
          name_kana: string | null
          phone: string | null
          prefecture: string
          status: string
          updated_at: string
          verified_owner_id: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          area_code?: string | null
          city: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_ids?: Json
          id?: string
          location?: unknown
          main_image_path?: string | null
          metadata?: Json
          name: string
          name_kana?: string | null
          phone?: string | null
          prefecture: string
          status?: string
          updated_at?: string
          verified_owner_id?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          area_code?: string | null
          city?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_ids?: Json
          id?: string
          location?: unknown
          main_image_path?: string | null
          metadata?: Json
          name?: string
          name_kana?: string | null
          phone?: string | null
          prefecture?: string
          status?: string
          updated_at?: string
          verified_owner_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cafes_area_code_fkey'
            columns: ['area_code']
            isOneToOne: false
            referencedRelation: 'areas'
            referencedColumns: ['code']
          },
          {
            foreignKeyName: 'cafes_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cafes_verified_owner_id_fkey'
            columns: ['verified_owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          is_official: boolean
          parent_id: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_official?: boolean
          parent_id?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_official?: boolean
          parent_id?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'comments_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'comments_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'comments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'comments_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
        ]
      }
      drafts: {
        Row: {
          author_id: string
          client_draft_key: string
          expires_at: string
          id: string
          last_saved_at: string
          payload: Json
        }
        Insert: {
          author_id: string
          client_draft_key: string
          expires_at?: string
          id?: string
          last_saved_at?: string
          payload: Json
        }
        Update: {
          author_id?: string
          client_draft_key?: string
          expires_at?: string
          id?: string
          last_saved_at?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'drafts_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'follows_followee_id_fkey'
            columns: ['followee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'follows_follower_id_fkey'
            columns: ['follower_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'likes_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'likes_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      ng_words: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          severity: string
          word: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          severity?: string
          word: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          severity?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ng_words_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_recipient_id_fkey'
            columns: ['recipient_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      post_bookmarks: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'post_bookmarks_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'post_bookmarks_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      post_images: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number
          height: number | null
          id: string
          post_id: string
          storage_path: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          height?: number | null
          id?: string
          post_id: string
          storage_path: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          height?: number | null
          id?: string
          post_id?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'post_images_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
        ]
      }
      post_tags: {
        Row: {
          created_at: string
          post_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'post_tags_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'post_tags_tag_id_fkey'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body_json: Json
          body_search: unknown
          body_text: string | null
          bookmark_count: number
          cafe_id: string | null
          comment_count: number
          created_at: string
          deleted_at: string | null
          id: string
          is_official: boolean
          like_count: number
          metadata: Json
          official_format: string | null
          post_type: string
          published_at: string | null
          status: string
          title: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          body_json: Json
          body_search?: unknown
          body_text?: string | null
          bookmark_count?: number
          cafe_id?: string | null
          comment_count?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_official?: boolean
          like_count?: number
          metadata?: Json
          official_format?: string | null
          post_type?: string
          published_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          body_json?: Json
          body_search?: unknown
          body_text?: string | null
          bookmark_count?: number
          cafe_id?: string | null
          comment_count?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_official?: boolean
          like_count?: number
          metadata?: Json
          official_format?: string | null
          post_type?: string
          published_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: 'posts_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'posts_cafe_id_fkey'
            columns: ['cafe_id']
            isOneToOne: false
            referencedRelation: 'cafes'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birth_date: string
          created_at: string
          display_name: string
          guardian_consent_at: string | null
          guardian_consent_token_expires_at: string | null
          guardian_consent_token_hash: string | null
          guardian_consent_token_issued_at: string | null
          guardian_email: string | null
          home_area_code: string | null
          id: string
          metadata: Json
          onboarded_at: string | null
          role: string
          status: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birth_date: string
          created_at?: string
          display_name: string
          guardian_consent_at?: string | null
          guardian_consent_token_expires_at?: string | null
          guardian_consent_token_hash?: string | null
          guardian_consent_token_issued_at?: string | null
          guardian_email?: string | null
          home_area_code?: string | null
          id: string
          metadata?: Json
          onboarded_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string
          created_at?: string
          display_name?: string
          guardian_consent_at?: string | null
          guardian_consent_token_expires_at?: string | null
          guardian_consent_token_hash?: string | null
          guardian_consent_token_issued_at?: string | null
          guardian_email?: string | null
          home_area_code?: string | null
          id?: string
          metadata?: Json
          onboarded_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_home_area_code_fkey'
            columns: ['home_area_code']
            isOneToOne: false
            referencedRelation: 'areas'
            referencedColumns: ['code']
          },
        ]
      }
      regular_customers: {
        Row: {
          awarded_at: string
          awarded_by: string
          cafe_id: string
          note: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          awarded_at?: string
          awarded_by: string
          cafe_id: string
          note?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          awarded_at?: string
          awarded_by?: string
          cafe_id?: string
          note?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'regular_customers_awarded_by_fkey'
            columns: ['awarded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'regular_customers_cafe_id_fkey'
            columns: ['cafe_id']
            isOneToOne: false
            referencedRelation: 'cafes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'regular_customers_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          reason: string
          reporter_id: string
          resolution_notes: string | null
          resolved_at: string | null
          reviewer_id: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          reviewer_id?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          reviewer_id?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reports_reporter_id_fkey'
            columns: ['reporter_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_reviewer_id_fkey'
            columns: ['reviewer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      tags: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_curated: boolean
          label: string
          priority: number
          slug: string
          usage_count: number
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_curated?: boolean
          label: string
          priority?: number
          slug: string
          usage_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_curated?: boolean
          label?: string
          priority?: number
          slug?: string
          usage_count?: number
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          context: Json | null
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          context?: Json | null
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          context?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_badges_badge_id_fkey'
            columns: ['badge_id']
            isOneToOne: false
            referencedRelation: 'badges'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_badges_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      user_cafe_lists: {
        Row: {
          cafe_id: string
          created_at: string
          list_type: string
          note: string | null
          user_id: string
        }
        Insert: {
          cafe_id: string
          created_at?: string
          list_type: string
          note?: string | null
          user_id: string
        }
        Update: {
          cafe_id?: string
          created_at?: string
          list_type?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_cafe_lists_cafe_id_fkey'
            columns: ['cafe_id']
            isOneToOne: false
            referencedRelation: 'cafes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_cafe_lists_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      user_interest_tags: {
        Row: {
          created_at: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_interest_tags_tag_id_fkey'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_interest_tags_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      user_settings: {
        Row: {
          allow_recommendation: boolean
          font_scale: string
          notify_comment: boolean
          notify_email: boolean
          notify_follow: boolean
          notify_like: boolean
          updated_at: string
          use_location: boolean
          user_id: string
        }
        Insert: {
          allow_recommendation?: boolean
          font_scale?: string
          notify_comment?: boolean
          notify_email?: boolean
          notify_follow?: boolean
          notify_like?: boolean
          updated_at?: string
          use_location?: boolean
          user_id: string
        }
        Update: {
          allow_recommendation?: boolean
          font_scale?: string
          notify_comment?: boolean
          notify_email?: boolean
          notify_follow?: boolean
          notify_like?: boolean
          updated_at?: string
          use_location?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_settings_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_guardian_consent: { Args: { p_token: string }; Returns: boolean }
      award_badge: {
        Args: { p_badge_code: string; p_user_id: string }
        Returns: undefined
      }
      badge_criteria_met: {
        Args: { p_criteria: Json; p_user_id: string }
        Returns: boolean
      }
      cafe_lat: {
        Args: { c: Database['public']['Tables']['cafes']['Row'] }
        Returns: number
      }
      cafe_lng: {
        Args: { c: Database['public']['Tables']['cafes']['Row'] }
        Returns: number
      }
      check_ng_words: { Args: { p_text: string }; Returns: string }
      comment_has_live_replies: {
        Args: { p_comment_id: string }
        Returns: boolean
      }
      count_likes_given: { Args: { p_user_id: string }; Returns: number }
      count_likes_received: { Args: { p_user_id: string }; Returns: number }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      finalize_official_post: {
        Args: {
          p_body_json: Json
          p_image_paths: string[]
          p_metadata: Json
          p_official_format: string
          p_post_id: string
          p_title: string
        }
        Returns: undefined
      }
      finalize_post: {
        Args: {
          p_body_json: Json
          p_cafe_id: string
          p_image_paths: string[]
          p_post_id: string
          p_post_type: string
          p_tag_ids: string[]
          p_title: string
          p_visibility: string
        }
        Returns: undefined
      }
      get_cafe_congestion_current: {
        Args: { p_cafe_id: string; p_now?: string }
        Returns: {
          level_avg: number
          sample_count: number
          source: string
        }[]
      }
      get_cafe_top_posters: {
        Args: { p_cafe_id: string; p_from: string; p_to: string }
        Returns: {
          avatar_url: string
          display_name: string
          post_count: number
          user_id: string
          username: string
        }[]
      }
      get_cafe_weekday_congestion: {
        Args: { p_cafe_id: string }
        Returns: {
          day_of_week: number
          level_avg: number
          sample_count: number
        }[]
      }
      get_owned_cafe: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      get_owned_cafe_for_edit: {
        Args: { p_cafe_id: string }
        Returns: {
          address: string
          area_code: string
          city: string
          description: string
          external_ids: Json
          id: string
          name: string
          name_kana: string
          phone: string
          prefecture: string
          website: string
        }[]
      }
      get_owner_verification_cafe: {
        Args: { p_cafe_id: string }
        Returns: {
          area_label: string
          id: string
          name: string
        }[]
      }
      get_regular_candidates: {
        Args: { p_cafe_id: string }
        Returns: {
          avatar_url: string
          bookmark_count: number
          comment_count: number
          display_name: string
          last_activity_at: string
          post_count: number
          user_id: string
          username: string
        }[]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_blocked_either_way: { Args: { p_other_id: string }; Returns: boolean }
      is_cafe_owner: { Args: { p_cafe_id: string }; Returns: boolean }
      is_post_author: { Args: { p_post_id: string }; Returns: boolean }
      is_post_cafe_owner: { Args: { p_post_id: string }; Returns: boolean }
      nearby_cafes: {
        Args: {
          p_area_code?: string
          p_lat: number
          p_limit?: number
          p_lng: number
          p_query?: string
        }
        Returns: {
          area_code: string
          area_label: string
          cafe_id: string
          distance_m: number
          is_verified: boolean
          lat: number
          lng: number
          name: string
        }[]
      }
      replace_user_interest_tags: {
        Args: { p_tag_ids: string[] }
        Returns: undefined
      }
      tiptap_to_plaintext: { Args: { doc: Json }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
