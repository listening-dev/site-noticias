export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  noticias: {
    Tables: {
      sources: {
        Row: Source
        Insert: Omit<Source, 'id' | 'created_at'>
        Update: Partial<Omit<Source, 'id'>>
      }
      news: {
        Row: News
        Insert: Omit<News, 'id' | 'created_at' | 'search_vector'>
        Update: Partial<Omit<News, 'id' | 'search_vector'>>
      }
      news_topics: {
        Row: NewsTopic
        Insert: Omit<NewsTopic, 'id' | 'extracted_at'>
        Update: Partial<Omit<NewsTopic, 'id'>>
      }
      clients: {
        Row: Client
        Insert: Omit<Client, 'id' | 'created_at'>
        Update: Partial<Omit<Client, 'id'>>
      }
      client_filters: {
        Row: ClientFilter
        Insert: Omit<ClientFilter, 'id' | 'created_at'>
        Update: Partial<Omit<ClientFilter, 'id'>>
      }
      client_news: {
        Row: ClientNews
        Insert: Omit<ClientNews, 'id' | 'matched_at'>
        Update: Partial<Omit<ClientNews, 'id'>>
      }
      global_themes: {
        Row: GlobalTheme
        Insert: Omit<GlobalTheme, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<GlobalTheme, 'id'>>
      }
      crisis_alerts: {
        Row: CrisisAlert
        Insert: Omit<CrisisAlert, 'id' | 'created_at'>
        Update: Partial<Omit<CrisisAlert, 'id'>>
      }
      client_themes: {
        Row: ClientTheme
        Insert: Omit<ClientTheme, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ClientTheme, 'id'>>
      }
      client_theme_matches: {
        Row: ClientThemeMatch
        Insert: Omit<ClientThemeMatch, 'id' | 'matched_at'>
        Update: Partial<Omit<ClientThemeMatch, 'id'>>
      }
      user_clients: {
        Row: UserClient
        Insert: UserClient
        Update: never
      }
      user_profiles: {
        Row: UserProfile
        Insert: Omit<UserProfile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserProfile, 'id'>>
      }
      user_favorites: {
        Row: UserFavorite
        Insert: Omit<UserFavorite, 'created_at'>
        Update: never
      }
      user_read_news: {
        Row: UserReadNews
        Insert: UserReadNews
        Update: never
      }
      client_sources: {
        Row: ClientSource
        Insert: ClientSource
        Update: never
      }
    }
  }
}

export interface Source {
  id: string
  name: string
  rss_url: string
  category: string | null
  active: boolean
  visible_in_overview: boolean
  created_at: string
}

export interface News {
  id: string
  title: string
  description: string | null
  url: string
  source_id: string | null
  category: string | null
  published_at: string | null
  created_at: string
  search_vector?: string
  // Joins
  sources?: Source
}

export interface Client {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface ClientFilter {
  id: string
  client_id: string
  label: string | null
  boolean_query: string
  tsquery_value: string | null
  active: boolean
  created_at: string
}

export interface ClientNews {
  id: string
  client_id: string
  news_id: string
  filter_id: string | null
  matched_at: string
  // Joins
  news?: News
  clients?: Client
}

export interface UserClient {
  user_id: string
  client_id: string
}

export interface UserProfile {
  id: string
  email: string | null
  full_name: string | null
  role: 'admin' | 'analyst' | 'account_manager' | 'strategist'
  created_at: string
  updated_at: string
}

export interface UserFavorite {
  user_id: string
  news_id: string
  created_at: string
}

export interface UserReadNews {
  user_id: string
  news_id: string
  read_at: string
}

export interface ClientSource {
  client_id: string
  source_id: string
}

// ============================================================
// Novos tipos para NLP, Temas e Crises
// ============================================================

export interface NewsTopic {
  id: string
  news_id: string
  topics: Array<{ name: string; confidence: number; category?: string }> | null
  entities: Array<{ name: string; type: string }> | null
  sentiment: 'positive' | 'neutral' | 'negative' | null
  category: string | null
  extracted_at: string
}

export interface GlobalTheme {
  id: string
  name: string
  description: string | null
  source: 'nlp_auto' | 'manual'
  status: 'active' | 'archived'
  confidence: number | null
  created_at: string
  updated_at: string
}

export interface CrisisAlert {
  id: string
  theme_id: string
  client_id: string | null
  severity: 'low' | 'medium' | 'high' | 'critical'
  matched_count: number
  started_at: string
  ended_at: string | null
  dismissed_by: string | null
  dismissed_at: string | null
  created_at: string
}

export interface ClientTheme {
  id: string
  client_id: string
  name: string
  description: string | null
  boolean_query: string | null
  tsquery_value: string | null
  nlp_enabled: boolean
  crisis_threshold: number
  status: 'active' | 'archived'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ClientThemeMatch {
  id: string
  client_id: string
  news_id: string
  theme_id: string
  match_reason: 'boolean' | 'nlp_match' | 'source_linked'
  confidence: number | null
  matched_at: string
}

// ============================================================
// Tipos utilitários para queries com joins
// ============================================================

export type NewsWithSource = News & { sources: Source }
export type ClientNewsWithNews = ClientNews & { news: NewsWithSource }
export type ClientWithFilters = Client & { client_filters: ClientFilter[] }
export type NewsWithTopics = News & { news_topics: NewsTopic | null }
export type ClientThemeWithMatches = ClientTheme & { client_theme_matches: ClientThemeMatch[] }
export type CrisisWithTheme = CrisisAlert & { global_themes: GlobalTheme | null }
