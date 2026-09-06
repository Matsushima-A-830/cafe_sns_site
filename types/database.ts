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
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birth_date: string
          created_at: string
          display_name: string
          guardian_consent_at: string | null
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
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      get_cafe_congestion_current: {
        Args: { p_cafe_id: string }
        Returns: {
          level_avg: number
          sample_count: number
          source: string
        }[]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_cafe_owner: { Args: { p_cafe_id: string }; Returns: boolean }
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
