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
      user_clients: {
        Row: UserClient
        Insert: UserClient
        Update: never
      }
      user_profiles: {
        Row: UserProfile
        Insert: Omit<UserProfile, 'created_at'>
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
    }
  }
}

export interface Source {
  id: string
  name: string
  rss_url: string
  category: string | null
  active: boolean
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
  role: 'admin' | 'analyst'
  created_at: string
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

// Tipos utilitários para queries com joins
export type NewsWithSource = News & { sources: Source }
export type ClientNewsWithNews = ClientNews & { news: NewsWithSource }
export type ClientWithFilters = Client & { client_filters: ClientFilter[] }
