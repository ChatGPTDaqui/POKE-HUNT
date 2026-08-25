export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  dev: {
    Tables: {
      admin_actions: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          payload: Json
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["dev"]["Enums"]["admin_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["dev"]["Enums"]["admin_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["dev"]["Enums"]["admin_role"]
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          contexto: Json
          criado_em: string
          fonte: string
          id: string
          mensagem: string
          nivel: string
          ocorrido_em: string
          rota: string | null
          user_id: string | null
        }
        Insert: {
          contexto?: Json
          criado_em?: string
          fonte: string
          id?: string
          mensagem: string
          nivel?: string
          ocorrido_em?: string
          rota?: string | null
          user_id?: string | null
        }
        Update: {
          contexto?: Json
          criado_em?: string
          fonte?: string
          id?: string
          mensagem?: string
          nivel?: string
          ocorrido_em?: string
          rota?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          bloqueado_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          bloqueado_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          bloqueado_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          anexos: Json
          body: string
          created_at: string
          id: string
          trainer_name: string
          user_id: string
        }
        Insert: {
          anexos?: Json
          body: string
          created_at?: string
          id?: string
          trainer_name: string
          user_id: string
        }
        Update: {
          anexos?: Json
          body?: string
          created_at?: string
          id?: string
          trainer_name?: string
          user_id?: string
        }
        Relationships: []
      }
      encounter_slot_rates: {
        Row: {
          percent: number
          slot: number
          slot_count: number
        }
        Insert: {
          percent: number
          slot: number
          slot_count: number
        }
        Update: {
          percent?: number
          slot?: number
          slot_count?: number
        }
        Relationships: []
      }
      fishing_encounters: {
        Row: {
          cumulative_threshold_percent: number
          fishing_group: string
          level: number
          rod_item_id: string
          slot: number
          species_id: string
        }
        Insert: {
          cumulative_threshold_percent: number
          fishing_group: string
          level: number
          rod_item_id: string
          slot: number
          species_id: string
        }
        Update: {
          cumulative_threshold_percent?: number
          fishing_group?: string
          level?: number
          rod_item_id?: string
          slot?: number
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fishing_encounters_rod_item_id_fkey"
            columns: ["rod_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fishing_encounters_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      formulas: {
        Row: {
          description: string | null
          expression: string
          key: string
          sort_order: number
          variables: string[]
        }
        Insert: {
          description?: string | null
          expression: string
          key: string
          sort_order?: number
          variables?: string[]
        }
        Update: {
          description?: string | null
          expression?: string
          key?: string
          sort_order?: number
          variables?: string[]
        }
        Relationships: []
      }
      friendships: {
        Row: {
          amigo_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          amigo_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          amigo_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          ciclos: number
          closed_at: string | null
          flushing_since: string | null
          id: string
          last_flush_at: string
          map_id: string
          poke_uid: string
          rng_draws: number
          rng_state: number
          sala_abates: number
          sala_chave: string | null
          sala_indice: number
          seed: number
          sequence_cleared: boolean
          sequence_index: number
          simulated_seconds: number
          started_at: string
          user_id: string
        }
        Insert: {
          ciclos?: number
          closed_at?: string | null
          flushing_since?: string | null
          id?: string
          last_flush_at?: string
          map_id: string
          poke_uid: string
          rng_draws?: number
          rng_state: number
          sala_abates?: number
          sala_chave?: string | null
          sala_indice?: number
          seed: number
          sequence_cleared?: boolean
          sequence_index?: number
          simulated_seconds?: number
          started_at?: string
          user_id: string
        }
        Update: {
          ciclos?: number
          closed_at?: string | null
          flushing_since?: string | null
          id?: string
          last_flush_at?: string
          map_id?: string
          poke_uid?: string
          rng_draws?: number
          rng_state?: number
          sala_abates?: number
          sala_chave?: string | null
          sala_indice?: number
          seed?: number
          sequence_cleared?: boolean
          sequence_index?: number
          simulated_seconds?: number
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "pokemon_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "ranking_pokemon"
            referencedColumns: ["id"]
          },
        ]
      }
      hall_da_fama: {
        Row: {
          conquista: string
          conquistado_em: string
          user_id: string
        }
        Insert: {
          conquista: string
          conquistado_em?: string
          user_id: string
        }
        Update: {
          conquista?: string
          conquistado_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hall_da_fama_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hall_da_fama_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      items: {
        Row: {
          buy_price: number | null
          buy_price_atual: number | null
          capture_rate: number | null
          description: string | null
          heal_amount: number | null
          heals_full: boolean
          heals_status: string[] | null
          id: string
          kind: Database["dev"]["Enums"]["item_kind"]
          name: string
          revive_hp_percent: number | null
          sell_price: number | null
          sort_order: number
          stone_type: Database["dev"]["Enums"]["element_type"] | null
        }
        Insert: {
          buy_price?: number | null
          buy_price_atual?: number | null
          capture_rate?: number | null
          description?: string | null
          heal_amount?: number | null
          heals_full?: boolean
          heals_status?: string[] | null
          id: string
          kind: Database["dev"]["Enums"]["item_kind"]
          name: string
          revive_hp_percent?: number | null
          sell_price?: number | null
          sort_order?: number
          stone_type?: Database["dev"]["Enums"]["element_type"] | null
        }
        Update: {
          buy_price?: number | null
          buy_price_atual?: number | null
          capture_rate?: number | null
          description?: string | null
          heal_amount?: number | null
          heals_full?: boolean
          heals_status?: string[] | null
          id?: string
          kind?: Database["dev"]["Enums"]["item_kind"]
          name?: string
          revive_hp_percent?: number | null
          sell_price?: number | null
          sort_order?: number
          stone_type?: Database["dev"]["Enums"]["element_type"] | null
        }
        Relationships: []
      }
      location_encounters: {
        Row: {
          level: number
          location_id: string
          period: Database["dev"]["Enums"]["day_period"]
          slot: number
          species_id: string
        }
        Insert: {
          level: number
          location_id: string
          period: Database["dev"]["Enums"]["day_period"]
          slot: number
          species_id: string
        }
        Update: {
          level?: number
          location_id?: string
          period?: Database["dev"]["Enums"]["day_period"]
          slot?: number
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_encounters_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_encounters_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          encounter_chance_day: number | null
          encounter_chance_morn: number | null
          encounter_chance_nite: number | null
          fishing_group: string | null
          id: string
          name: string
        }
        Insert: {
          encounter_chance_day?: number | null
          encounter_chance_morn?: number | null
          encounter_chance_nite?: number | null
          fishing_group?: string | null
          id: string
          name: string
        }
        Update: {
          encounter_chance_day?: number | null
          encounter_chance_morn?: number | null
          encounter_chance_nite?: number | null
          fishing_group?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      mail_messages: {
        Row: {
          anexo_coletado_em: string | null
          anexo_itens: Json
          assunto: string | null
          corpo: string
          created_at: string
          de_id: string | null
          de_nome: string
          estado: string
          excluido_destinatario_em: string | null
          excluido_remetente_em: string | null
          id: string
          para_id: string
          read_at: string | null
          tipo: string
        }
        Insert: {
          anexo_coletado_em?: string | null
          anexo_itens?: Json
          assunto?: string | null
          corpo?: string
          created_at?: string
          de_id?: string | null
          de_nome: string
          estado?: string
          excluido_destinatario_em?: string | null
          excluido_remetente_em?: string | null
          id?: string
          para_id: string
          read_at?: string | null
          tipo: string
        }
        Update: {
          anexo_coletado_em?: string | null
          anexo_itens?: Json
          assunto?: string | null
          corpo?: string
          created_at?: string
          de_id?: string | null
          de_nome?: string
          estado?: string
          excluido_destinatario_em?: string | null
          excluido_remetente_em?: string | null
          id?: string
          para_id?: string
          read_at?: string | null
          tipo?: string
        }
        Relationships: []
      }
      map_encounters: {
        Row: {
          map_id: string
          max_level: number
          min_level: number
          sort_order: number
          species_id: string
          weight: number
        }
        Insert: {
          map_id: string
          max_level: number
          min_level: number
          sort_order?: number
          species_id: string
          weight: number
        }
        Update: {
          map_id?: string
          max_level?: number
          min_level?: number
          sort_order?: number
          species_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_encounters_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_encounters_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      maps: {
        Row: {
          bg_theme: string
          bounds_height: number
          bounds_width: number
          continent: Database["dev"]["Enums"]["map_continent"]
          id: string
          max_level: number
          min_level: number
          name: string
          sort_order: number
          unlock_cost: number | null
        }
        Insert: {
          bg_theme: string
          bounds_height?: number
          bounds_width?: number
          continent: Database["dev"]["Enums"]["map_continent"]
          id: string
          max_level: number
          min_level: number
          name: string
          sort_order?: number
          unlock_cost?: number | null
        }
        Update: {
          bg_theme?: string
          bounds_height?: number
          bounds_width?: number
          continent?: Database["dev"]["Enums"]["map_continent"]
          id?: string
          max_level?: number
          min_level?: number
          name?: string
          sort_order?: number
          unlock_cost?: number | null
        }
        Relationships: []
      }
      market_deliveries: {
        Row: {
          claimed_at: string | null
          created_at: string
          diamonds: number
          gold: number
          id: string
          item_id: string | null
          motivo: string
          quantity: number
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          diamonds?: number
          gold?: number
          id?: string
          item_id?: string | null
          motivo: string
          quantity?: number
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          diamonds?: number
          gold?: number
          id?: string
          item_id?: string | null
          motivo?: string
          quantity?: number
          user_id?: string
        }
        Relationships: []
      }
      market_listings: {
        Row: {
          apenas_oferta: boolean
          buyer_id: string | null
          created_at: string
          currency: string
          expira_em: string | null
          id: string
          incremento_minimo: number | null
          is_shiny: boolean
          iv_percent: number
          lance_minimo: number | null
          level: number
          modo: string
          poke_uid: string | null
          price: number | null
          rarity: Database["dev"]["Enums"]["rarity_tier"]
          seller_id: string
          sold_at: string | null
          species_id: string
          status: string
        }
        Insert: {
          apenas_oferta?: boolean
          buyer_id?: string | null
          created_at?: string
          currency: string
          expira_em?: string | null
          id?: string
          incremento_minimo?: number | null
          is_shiny?: boolean
          iv_percent?: number
          lance_minimo?: number | null
          level: number
          modo?: string
          poke_uid?: string | null
          price?: number | null
          rarity: Database["dev"]["Enums"]["rarity_tier"]
          seller_id: string
          sold_at?: string | null
          species_id: string
          status?: string
        }
        Update: {
          apenas_oferta?: boolean
          buyer_id?: string | null
          created_at?: string
          currency?: string
          expira_em?: string | null
          id?: string
          incremento_minimo?: number | null
          is_shiny?: boolean
          iv_percent?: number
          lance_minimo?: number | null
          level?: number
          modo?: string
          poke_uid?: string | null
          price?: number | null
          rarity?: Database["dev"]["Enums"]["rarity_tier"]
          seller_id?: string
          sold_at?: string | null
          species_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_listings_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "pokemon_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listings_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "ranking_pokemon"
            referencedColumns: ["id"]
          },
        ]
      }
      market_offers: {
        Row: {
          buyer_id: string
          created_at: string
          currency: string
          id: string
          listing_id: string
          resolved_at: string | null
          status: string
          valor: number
        }
        Insert: {
          buyer_id: string
          created_at?: string
          currency: string
          id?: string
          listing_id: string
          resolved_at?: string | null
          status?: string
          valor: number
        }
        Update: {
          buyer_id?: string
          created_at?: string
          currency?: string
          id?: string
          listing_id?: string
          resolved_at?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "mercado_anuncios_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      market_orders: {
        Row: {
          closed_at: string | null
          created_at: string
          gold_retido: number
          id: string
          item_id: string
          quantity: number
          remaining: number
          side: string
          status: string
          unit_price: number
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          gold_retido?: number
          id?: string
          item_id: string
          quantity: number
          remaining: number
          side: string
          status?: string
          unit_price: number
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          gold_retido?: number
          id?: string
          item_id?: string
          quantity?: number
          remaining?: number
          side?: string
          status?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: []
      }
      market_trades: {
        Row: {
          buyer_id: string | null
          created_at: string
          currency: string
          id: string
          item_id: string | null
          kind: string
          quantity: number
          seller_id: string | null
          species_id: string | null
          taxa: number
          unit_price: number
        }
        Insert: {
          buyer_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          item_id?: string | null
          kind: string
          quantity?: number
          seller_id?: string | null
          species_id?: string | null
          taxa?: number
          unit_price: number
        }
        Update: {
          buyer_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          item_id?: string | null
          kind?: string
          quantity?: number
          seller_id?: string | null
          species_id?: string | null
          taxa?: number
          unit_price?: number
        }
        Relationships: []
      }
      moves: {
        Row: {
          accuracy: number
          always_hits: boolean
          aoe_radius: number | null
          category: Database["dev"]["Enums"]["move_category"]
          fixed_damage_mode: string | null
          id: string
          multi_hit: boolean
          name: string
          power: number
          pp: number
          priority: number
          recoil_fraction: number | null
          target: Database["dev"]["Enums"]["move_target"]
          type: Database["dev"]["Enums"]["element_type"]
        }
        Insert: {
          accuracy: number
          always_hits?: boolean
          aoe_radius?: number | null
          category: Database["dev"]["Enums"]["move_category"]
          fixed_damage_mode?: string | null
          id: string
          multi_hit?: boolean
          name: string
          power: number
          pp: number
          priority?: number
          recoil_fraction?: number | null
          target?: Database["dev"]["Enums"]["move_target"]
          type: Database["dev"]["Enums"]["element_type"]
        }
        Update: {
          accuracy?: number
          always_hits?: boolean
          aoe_radius?: number | null
          category?: Database["dev"]["Enums"]["move_category"]
          fixed_damage_mode?: string | null
          id?: string
          multi_hit?: boolean
          name?: string
          power?: number
          pp?: number
          priority?: number
          recoil_fraction?: number | null
          target?: Database["dev"]["Enums"]["move_target"]
          type?: Database["dev"]["Enums"]["element_type"]
        }
        Relationships: []
      }
      player_auto_catch_rules: {
        Row: {
          ball_item_id: string
          created_at: string
          id: string
          species_id: string
          user_id: string
        }
        Insert: {
          ball_item_id: string
          created_at?: string
          id?: string
          species_id: string
          user_id: string
        }
        Update: {
          ball_item_id?: string
          created_at?: string
          id?: string
          species_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_auto_catch_rules_ball_item_id_fkey"
            columns: ["ball_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_auto_catch_rules_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_auto_catch_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "player_auto_catch_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      player_items: {
        Row: {
          item_id: string
          locked: boolean
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          item_id: string
          locked?: boolean
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          item_id?: string
          locked?: boolean
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "player_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      player_pokedex: {
        Row: {
          normal_kills: number
          shiny_kills: number
          species_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          normal_kills?: number
          shiny_kills?: number
          species_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          normal_kills?: number
          shiny_kills?: number
          species_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_pokedex_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_pokedex_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "player_pokedex_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      players: {
        Row: {
          active_team_index: number
          auto_catch_config: Json
          auto_pot_rules: Json
          auto_sell_config: Json
          auto_status_config: Json
          auto_toggles: Json
          created_at: string
          current_map_id: string | null
          diamonds: number
          gold: number
          perf_stats: Json
          trainer_exp: number
          trainer_level: number
          trainer_name: string
          unlocked_continents: string[]
          unlocked_maps: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active_team_index?: number
          auto_catch_config?: Json
          auto_pot_rules?: Json
          auto_sell_config?: Json
          auto_status_config?: Json
          auto_toggles?: Json
          created_at?: string
          current_map_id?: string | null
          diamonds?: number
          gold?: number
          perf_stats?: Json
          trainer_exp?: number
          trainer_level?: number
          trainer_name?: string
          unlocked_continents?: string[]
          unlocked_maps?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active_team_index?: number
          auto_catch_config?: Json
          auto_pot_rules?: Json
          auto_sell_config?: Json
          auto_status_config?: Json
          auto_toggles?: Json
          created_at?: string
          current_map_id?: string | null
          diamonds?: number
          gold?: number
          perf_stats?: Json
          trainer_exp?: number
          trainer_level?: number
          trainer_name?: string
          unlocked_continents?: string[]
          unlocked_maps?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pokemon_instances: {
        Row: {
          active_abilities: string[] | null
          created_at: string
          disabled_abilities: Json
          exp: number
          hp: number
          id: string
          is_shiny: boolean
          iv_atk_esp: number
          iv_atk_fis: number
          iv_def: number
          iv_def_esp: number
          iv_hp: number
          iv_speed: number
          level: number
          location: Database["dev"]["Enums"]["pokemon_location"]
          locked: boolean
          nature: string | null
          original_trainer: string | null
          rarity: Database["dev"]["Enums"]["rarity_tier"]
          species_id: string
          stat_atk_esp: number
          stat_atk_fis: number
          stat_def: number
          stat_def_esp: number
          stat_hp: number
          stat_speed: number
          status: string | null
          status_turns: number | null
          team_slot: number | null
          trait: string | null
          unlocked_abilities: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active_abilities?: string[] | null
          created_at?: string
          disabled_abilities?: Json
          exp?: number
          hp: number
          id?: string
          is_shiny?: boolean
          iv_atk_esp: number
          iv_atk_fis: number
          iv_def: number
          iv_def_esp: number
          iv_hp: number
          iv_speed: number
          level?: number
          location: Database["dev"]["Enums"]["pokemon_location"]
          locked?: boolean
          nature?: string | null
          original_trainer?: string | null
          rarity?: Database["dev"]["Enums"]["rarity_tier"]
          species_id: string
          stat_atk_esp: number
          stat_atk_fis: number
          stat_def: number
          stat_def_esp: number
          stat_hp: number
          stat_speed: number
          status?: string | null
          status_turns?: number | null
          team_slot?: number | null
          trait?: string | null
          unlocked_abilities?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active_abilities?: string[] | null
          created_at?: string
          disabled_abilities?: Json
          exp?: number
          hp?: number
          id?: string
          is_shiny?: boolean
          iv_atk_esp?: number
          iv_atk_fis?: number
          iv_def?: number
          iv_def_esp?: number
          iv_hp?: number
          iv_speed?: number
          level?: number
          location?: Database["dev"]["Enums"]["pokemon_location"]
          locked?: boolean
          nature?: string | null
          original_trainer?: string | null
          rarity?: Database["dev"]["Enums"]["rarity_tier"]
          species_id?: string
          stat_atk_esp?: number
          stat_atk_fis?: number
          stat_def?: number
          stat_def_esp?: number
          stat_hp?: number
          stat_speed?: number
          status?: string | null
          status_turns?: number | null
          team_slot?: number | null
          trait?: string | null
          unlocked_abilities?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pokemon_instances_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pokemon_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pokemon_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      spawn_tiers: {
        Row: {
          key: string
          sort_order: number
          weight: number
        }
        Insert: {
          key: string
          sort_order: number
          weight: number
        }
        Update: {
          key?: string
          sort_order?: number
          weight?: number
        }
        Relationships: []
      }
      species: {
        Row: {
          base_atk_esp: number
          base_atk_fis: number
          base_def: number
          base_def_esp: number
          base_exp: number
          base_hp: number
          base_speed: number
          catch_rate: number
          dex_number: number
          evolves_at_level: number | null
          evolves_to: string | null
          growth_curve: string
          height_m: number | null
          id: string
          is_legendary: boolean
          is_special_evolution: boolean
          name: string
          spawn_tier: string
          type1: Database["dev"]["Enums"]["element_type"]
          type2: Database["dev"]["Enums"]["element_type"] | null
        }
        Insert: {
          base_atk_esp: number
          base_atk_fis: number
          base_def: number
          base_def_esp: number
          base_exp: number
          base_hp: number
          base_speed: number
          catch_rate: number
          dex_number: number
          evolves_at_level?: number | null
          evolves_to?: string | null
          growth_curve: string
          height_m?: number | null
          id: string
          is_legendary?: boolean
          is_special_evolution?: boolean
          name: string
          spawn_tier: string
          type1: Database["dev"]["Enums"]["element_type"]
          type2?: Database["dev"]["Enums"]["element_type"] | null
        }
        Update: {
          base_atk_esp?: number
          base_atk_fis?: number
          base_def?: number
          base_def_esp?: number
          base_exp?: number
          base_hp?: number
          base_speed?: number
          catch_rate?: number
          dex_number?: number
          evolves_at_level?: number | null
          evolves_to?: string | null
          growth_curve?: string
          height_m?: number | null
          id?: string
          is_legendary?: boolean
          is_special_evolution?: boolean
          name?: string
          spawn_tier?: string
          type1?: Database["dev"]["Enums"]["element_type"]
          type2?: Database["dev"]["Enums"]["element_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "species_evolves_to_fkey"
            columns: ["evolves_to"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "species_spawn_tier_fkey"
            columns: ["spawn_tier"]
            isOneToOne: false
            referencedRelation: "spawn_tiers"
            referencedColumns: ["key"]
          },
        ]
      }
      species_evolution_options: {
        Row: {
          evolves_at_level: number
          evolves_to: string
          is_special_evolution: boolean
          ordem: number
          species_id: string
        }
        Insert: {
          evolves_at_level: number
          evolves_to: string
          is_special_evolution?: boolean
          ordem?: number
          species_id: string
        }
        Update: {
          evolves_at_level?: number
          evolves_to?: string
          is_special_evolution?: boolean
          ordem?: number
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "species_evolution_options_evolves_to_fkey"
            columns: ["evolves_to"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "species_evolution_options_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      species_moves: {
        Row: {
          level_req: number
          move_id: string
          sort_order: number
          species_id: string
        }
        Insert: {
          level_req: number
          move_id: string
          sort_order?: number
          species_id: string
        }
        Update: {
          level_req?: number
          move_id?: string
          sort_order?: number
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "species_moves_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "species_moves_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      tempo_jogado_arquivado: {
        Row: {
          atualizado_em: string
          segundos: number
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          segundos?: number
          user_id: string
        }
        Update: {
          atualizado_em?: string
          segundos?: number
          user_id?: string
        }
        Relationships: []
      }
      type_chart: {
        Row: {
          attacking_type: Database["dev"]["Enums"]["element_type"]
          defending_type: Database["dev"]["Enums"]["element_type"]
          multiplier: number
        }
        Insert: {
          attacking_type: Database["dev"]["Enums"]["element_type"]
          defending_type: Database["dev"]["Enums"]["element_type"]
          multiplier: number
        }
        Update: {
          attacking_type?: Database["dev"]["Enums"]["element_type"]
          defending_type?: Database["dev"]["Enums"]["element_type"]
          multiplier?: number
        }
        Relationships: []
      }
    }
    Views: {
      mercado_anuncios_ativos: {
        Row: {
          apenas_oferta: boolean | null
          buyer_id: string | null
          created_at: string | null
          currency: string | null
          expira_em: string | null
          id: string | null
          incremento_minimo: number | null
          is_shiny: boolean | null
          iv_percent: number | null
          lance_minimo: number | null
          level: number | null
          melhor_oferta: number | null
          modo: string | null
          ofertas: number | null
          poke_uid: string | null
          price: number | null
          rarity: Database["dev"]["Enums"]["rarity_tier"] | null
          seller_id: string | null
          sold_at: string | null
          species_id: string | null
          status: string | null
          vendedor: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_listings_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "pokemon_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listings_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "ranking_pokemon"
            referencedColumns: ["id"]
          },
        ]
      }
      mercado_historico_itens: {
        Row: {
          currency: string | null
          dia: string | null
          item_id: string | null
          maximo: number | null
          mediana: number | null
          minimo: number | null
          negocios: number | null
          volume: number | null
        }
        Relationships: []
      }
      mercado_historico_pokes: {
        Row: {
          currency: string | null
          dia: string | null
          maximo: number | null
          mediana: number | null
          minimo: number | null
          negocios: number | null
          species_id: string | null
          volume: number | null
        }
        Relationships: []
      }
      mercado_ofertas_recebidas: {
        Row: {
          buyer_id: string | null
          comprador: string | null
          created_at: string | null
          currency: string | null
          id: string | null
          is_shiny: boolean | null
          level: number | null
          listing_id: string | null
          resolved_at: string | null
          seller_id: string | null
          species_id: string | null
          status: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "mercado_anuncios_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      mercado_resumo_historico_itens: {
        Row: {
          currency: string | null
          item_id: string | null
          mediana_24h: number | null
          mediana_7d: number | null
          negocios_30d: number | null
          volume_24h: number | null
          volume_30d: number | null
        }
        Relationships: []
      }
      mercado_resumo_historico_pokes: {
        Row: {
          currency: string | null
          mediana_24h: number | null
          mediana_7d: number | null
          negocios_30d: number | null
          species_id: string | null
          volume_24h: number | null
          volume_30d: number | null
        }
        Relationships: []
      }
      mercado_resumo_itens: {
        Row: {
          em_compra: number | null
          em_venda: number | null
          item_id: string | null
          melhor_compra: number | null
          melhor_venda: number | null
        }
        Relationships: []
      }
      ranking_pokemon: {
        Row: {
          created_at: string | null
          disabled_abilities: Json | null
          exp: number | null
          hp: number | null
          id: string | null
          is_shiny: boolean | null
          iv_atk_esp: number | null
          iv_atk_fis: number | null
          iv_def: number | null
          iv_def_esp: number | null
          iv_hp: number | null
          iv_speed: number | null
          level: number | null
          location: Database["dev"]["Enums"]["pokemon_location"] | null
          locked: boolean | null
          original_trainer: string | null
          rarity: Database["dev"]["Enums"]["rarity_tier"] | null
          species_id: string | null
          stat_atk_esp: number | null
          stat_atk_fis: number | null
          stat_def: number | null
          stat_def_esp: number | null
          stat_hp: number | null
          stat_speed: number | null
          team_slot: number | null
          treinador: string | null
          unlocked_abilities: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pokemon_instances_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pokemon_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pokemon_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      treinadores_publico: {
        Row: {
          trainer_exp: number | null
          trainer_level: number | null
          trainer_name: string | null
          user_id: string | null
        }
        Insert: {
          trainer_exp?: number | null
          trainer_level?: number | null
          trainer_name?: string | null
          user_id?: string | null
        }
        Update: {
          trainer_exp?: number | null
          trainer_level?: number | null
          trainer_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _calcular_stat: {
        Args: {
          p_base: number
          p_is_hp: boolean
          p_iv: number
          p_level: number
        }
        Returns: number
      }
      _calcular_stats:
        | {
            Args: {
              p_is_shiny: boolean
              p_iv_atk_esp: number
              p_iv_atk_fis: number
              p_iv_def: number
              p_iv_def_esp: number
              p_iv_hp: number
              p_iv_speed: number
              p_level: number
              p_rarity: string
              p_species: Database["dev"]["Tables"]["species"]["Row"]
            }
            Returns: {
              stat_atk_esp: number
              stat_atk_fis: number
              stat_def: number
              stat_def_esp: number
              stat_hp: number
              stat_speed: number
            }[]
          }
        | {
            Args: {
              p_is_shiny: boolean
              p_iv_atk_esp: number
              p_iv_atk_fis: number
              p_iv_def: number
              p_iv_def_esp: number
              p_iv_hp: number
              p_iv_speed: number
              p_level: number
              p_nature: string
              p_rarity: string
              p_species: Database["dev"]["Tables"]["species"]["Row"]
            }
            Returns: {
              stat_atk_esp: number
              stat_atk_fis: number
              stat_def: number
              stat_def_esp: number
              stat_hp: number
              stat_speed: number
            }[]
          }
      _mult_natureza: {
        Args: { p_nature: string; p_stat: string }
        Returns: number
      }
      _valor_venda_poke: {
        Args: { p_base_exp: number; p_level: number; p_rarity: string }
        Returns: number
      }
      alternar_habilidade: {
        Args: { p_ability_id: string; p_poke_id: string }
        Returns: Json
      }
      alternar_trava_item: { Args: { p_item_id: string }; Returns: Json }
      alternar_trava_poke: { Args: { p_poke_id: string }; Returns: Json }
      amigos_detalhados: { Args: never; Returns: Json }
      anunciar_poke: {
        Args: {
          p_apenas_oferta: boolean
          p_currency: string
          p_poke_id: string
          p_price: number
        }
        Returns: Json
      }
      bloquear_jogador: { Args: { p_alvo_id: string }; Returns: Json }
      bloqueio_entre: { Args: { p_a: string; p_b: string }; Returns: boolean }
      cancelar_anuncio: { Args: { p_anuncio_id: string }; Returns: Json }
      cancelar_oferta: { Args: { p_oferta_id: string }; Returns: Json }
      cancelar_ordem_mercado: { Args: { p_ordem_id: string }; Returns: Json }
      coletar_anexo_correio: { Args: { p_mensagem_id: string }; Returns: Json }
      comprar_anuncio: { Args: { p_anuncio_id: string }; Returns: Json }
      comprar_item: {
        Args: { p_item_id: string; p_qtd?: number }
        Returns: Json
      }
      concessao_inicial_de_itens: {
        Args: never
        Returns: {
          item_id: string
          quantity: number
        }[]
      }
      configurar_auto: { Args: { p_patch: Json }; Returns: Json }
      conversas: { Args: never; Returns: Json }
      criar_leilao: {
        Args: {
          p_currency: string
          p_horas: number
          p_incremento_minimo: number
          p_lance_minimo: number
          p_poke_id: string
        }
        Returns: Json
      }
      criar_ordem_mercado: {
        Args: {
          p_item_id: string
          p_quantity: number
          p_side: string
          p_unit_price: number
        }
        Returns: Json
      }
      curar_equipe: { Args: never; Returns: Json }
      dar_lance: {
        Args: { p_anuncio_id: string; p_valor: number }
        Returns: Json
      }
      definir_ativo: { Args: { p_poke_id: string }; Returns: Json }
      definir_golpes_ativos: {
        Args: { p_ability_ids: string[]; p_poke_id: string }
        Returns: Json
      }
      definir_nome_do_treinador: { Args: { p_nome: string }; Returns: Json }
      desbloquear_hunt: { Args: { p_map_id: string }; Returns: Json }
      desbloquear_jogador: { Args: { p_alvo_id: string }; Returns: Json }
      encerrar_leiloes_vencidos: { Args: { p_limite?: number }; Returns: Json }
      enviar_mensagem: {
        Args: {
          p_anexos?: Json
          p_corpo: string
          p_para_id?: string
          p_para_nick?: string
        }
        Returns: Json
      }
      escolher_starter: { Args: { p_species_id: string }; Returns: Json }
      esta_online: { Args: { p_user_id: string }; Returns: boolean }
      evoluir_poke:
        | { Args: { p_poke_id: string }; Returns: Json }
        | { Args: { p_alvo?: string; p_poke_id: string }; Returns: Json }
      excluir_conversa: { Args: { p_contato_id: string }; Returns: Json }
      excluir_correio: { Args: { p_mensagem_id: string }; Returns: Json }
      gravar_progresso: {
        Args: {
          p_patch: Json
          p_updated_at_esperado: string
          p_user_id: string
        }
        Returns: Json
      }
      hunts_iniciais: { Args: never; Returns: string[] }
      id_por_nome_de_treinador: { Args: { nome: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      marcar_conversa_lida: { Args: { p_contato_id: string }; Returns: Json }
      marcar_correio_lido: { Args: { p_mensagem_id: string }; Returns: Json }
      meu_perfil: { Args: never; Returns: Json }
      nome_de_treinador_disponivel: { Args: { nome: string }; Returns: boolean }
      ofertar_no_anuncio: {
        Args: { p_anuncio_id: string; p_valor: number }
        Returns: Json
      }
      pedir_amizade: { Args: { p_nick: string }; Returns: Json }
      por_na_equipe: { Args: { p_poke_id: string }; Returns: Json }
      recusar_ofertas_pendentes: {
        Args: { p_anuncio_id: string; p_exceto?: string; p_motivo: string }
        Returns: number
      }
      registrar_evento_auditoria: {
        Args: {
          p_contexto?: Json
          p_mensagem: string
          p_nivel?: string
          p_rota: string
        }
        Returns: undefined
      }
      reiniciar_jogo: { Args: never; Returns: undefined }
      remover_amizade: { Args: { p_amigo_id: string }; Returns: Json }
      reordenar_equipe: { Args: { p_ordem: string[] }; Returns: Json }
      responder_oferta: {
        Args: { p_aceitar: boolean; p_oferta_id: string }
        Returns: Json
      }
      responder_pedido_amizade: {
        Args: { p_aceitar: boolean; p_mensagem_id: string }
        Returns: Json
      }
      taxa_de_venda: {
        Args: { p_currency: string; p_valor: number }
        Returns: number
      }
      taxa_do_mercado: { Args: never; Returns: Json }
      tem_outra_sessao_de_auth_ativa: { Args: never; Returns: boolean }
      tirar_da_equipe: { Args: { p_poke_id: string }; Returns: Json }
      usar_item: { Args: { p_item_id: string }; Returns: Json }
      vender_item: {
        Args: { p_item_id: string; p_qtd?: number }
        Returns: Json
      }
      vender_poke: { Args: { p_poke_id: string }; Returns: Json }
      vender_pokes: { Args: { p_poke_ids: string[] }; Returns: Json }
      vender_todos_itens: { Args: never; Returns: Json }
      wipe_inventario_e_economia: {
        Args: never
        Returns: {
          jogadores_afetados: number
          linhas_de_item_apagadas: number
        }[]
      }
      wipe_mundo_social: {
        Args: never
        Returns: {
          amizades: number
          anuncios: number
          chat: number
          entregas: number
          mensagens: number
          negocios: number
          ordens: number
        }[]
      }
      wipe_todos_os_saves: {
        Args: never
        Returns: {
          jogadores_resetados: number
          pokes_apagados: number
          sessoes_fechadas: number
        }[]
      }
    }
    Enums: {
      admin_role: "support" | "owner"
      day_period: "morn" | "day" | "nite"
      element_type:
        | "NORMAL"
        | "FIRE"
        | "WATER"
        | "ELECTRIC"
        | "GRASS"
        | "ICE"
        | "FIGHTING"
        | "POISON"
        | "GROUND"
        | "FLYING"
        | "PSYCHIC"
        | "BUG"
        | "ROCK"
        | "GHOST"
        | "DRAGON"
        | "DARK"
        | "STEEL"
        | "FAIRY"
      item_kind: "ball" | "potion" | "revive" | "rod" | "stone" | "status_heal"
      map_continent: "johto" | "kanto"
      move_category: "physical" | "special"
      move_target: "single" | "aoe"
      pokemon_location: "team" | "bag" | "market"
      rarity_tier:
        | "comum"
        | "incomum"
        | "raro"
        | "ultra"
        | "legendary"
        | "mythic"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
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
      admin_actions: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          payload: Json
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["admin_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          contexto: Json
          criado_em: string
          fonte: string
          id: string
          mensagem: string
          nivel: string
          ocorrido_em: string
          rota: string | null
          user_id: string | null
        }
        Insert: {
          contexto?: Json
          criado_em?: string
          fonte: string
          id?: string
          mensagem: string
          nivel?: string
          ocorrido_em?: string
          rota?: string | null
          user_id?: string | null
        }
        Update: {
          contexto?: Json
          criado_em?: string
          fonte?: string
          id?: string
          mensagem?: string
          nivel?: string
          ocorrido_em?: string
          rota?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_cursor: {
        Row: {
          id: string
          processando_desde: string | null
          ultimo_processado: string
        }
        Insert: {
          id: string
          processando_desde?: string | null
          ultimo_processado: string
        }
        Update: {
          id?: string
          processando_desde?: string | null
          ultimo_processado?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          bloqueado_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          bloqueado_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          bloqueado_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          anexos: Json
          body: string
          created_at: string
          id: string
          trainer_name: string
          user_id: string
        }
        Insert: {
          anexos?: Json
          body: string
          created_at?: string
          id?: string
          trainer_name: string
          user_id: string
        }
        Update: {
          anexos?: Json
          body?: string
          created_at?: string
          id?: string
          trainer_name?: string
          user_id?: string
        }
        Relationships: []
      }
      encounter_slot_rates: {
        Row: {
          percent: number
          slot: number
          slot_count: number
        }
        Insert: {
          percent: number
          slot: number
          slot_count: number
        }
        Update: {
          percent?: number
          slot?: number
          slot_count?: number
        }
        Relationships: []
      }
      fishing_encounters: {
        Row: {
          cumulative_threshold_percent: number
          fishing_group: string
          level: number
          rod_item_id: string
          slot: number
          species_id: string
        }
        Insert: {
          cumulative_threshold_percent: number
          fishing_group: string
          level: number
          rod_item_id: string
          slot: number
          species_id: string
        }
        Update: {
          cumulative_threshold_percent?: number
          fishing_group?: string
          level?: number
          rod_item_id?: string
          slot?: number
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fishing_encounters_rod_item_id_fkey"
            columns: ["rod_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fishing_encounters_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      formulas: {
        Row: {
          description: string | null
          expression: string
          key: string
          sort_order: number
          variables: string[]
        }
        Insert: {
          description?: string | null
          expression: string
          key: string
          sort_order?: number
          variables?: string[]
        }
        Update: {
          description?: string | null
          expression?: string
          key?: string
          sort_order?: number
          variables?: string[]
        }
        Relationships: []
      }
      friendships: {
        Row: {
          amigo_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          amigo_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          amigo_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          ciclos: number
          closed_at: string | null
          flushing_since: string | null
          id: string
          last_flush_at: string
          map_id: string
          poke_uid: string
          rng_draws: number
          rng_state: number
          sala_abates: number
          sala_chave: string | null
          sala_indice: number
          seed: number
          sequence_cleared: boolean
          sequence_index: number
          simulated_seconds: number
          started_at: string
          user_id: string
        }
        Insert: {
          ciclos?: number
          closed_at?: string | null
          flushing_since?: string | null
          id?: string
          last_flush_at?: string
          map_id: string
          poke_uid: string
          rng_draws?: number
          rng_state: number
          sala_abates?: number
          sala_chave?: string | null
          sala_indice?: number
          seed: number
          sequence_cleared?: boolean
          sequence_index?: number
          simulated_seconds?: number
          started_at?: string
          user_id: string
        }
        Update: {
          ciclos?: number
          closed_at?: string | null
          flushing_since?: string | null
          id?: string
          last_flush_at?: string
          map_id?: string
          poke_uid?: string
          rng_draws?: number
          rng_state?: number
          sala_abates?: number
          sala_chave?: string | null
          sala_indice?: number
          seed?: number
          sequence_cleared?: boolean
          sequence_index?: number
          simulated_seconds?: number
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "pokemon_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "ranking_pokemon"
            referencedColumns: ["id"]
          },
        ]
      }
      hall_da_fama: {
        Row: {
          conquista: string
          conquistado_em: string
          user_id: string
        }
        Insert: {
          conquista: string
          conquistado_em?: string
          user_id: string
        }
        Update: {
          conquista?: string
          conquistado_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hall_da_fama_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hall_da_fama_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      items: {
        Row: {
          buy_price: number | null
          buy_price_atual: number | null
          capture_rate: number | null
          description: string | null
          heal_amount: number | null
          heals_full: boolean
          heals_status: string[] | null
          id: string
          kind: Database["public"]["Enums"]["item_kind"]
          name: string
          revive_hp_percent: number | null
          sell_price: number | null
          sort_order: number
          stone_type: Database["public"]["Enums"]["element_type"] | null
        }
        Insert: {
          buy_price?: number | null
          buy_price_atual?: number | null
          capture_rate?: number | null
          description?: string | null
          heal_amount?: number | null
          heals_full?: boolean
          heals_status?: string[] | null
          id: string
          kind: Database["public"]["Enums"]["item_kind"]
          name: string
          revive_hp_percent?: number | null
          sell_price?: number | null
          sort_order?: number
          stone_type?: Database["public"]["Enums"]["element_type"] | null
        }
        Update: {
          buy_price?: number | null
          buy_price_atual?: number | null
          capture_rate?: number | null
          description?: string | null
          heal_amount?: number | null
          heals_full?: boolean
          heals_status?: string[] | null
          id?: string
          kind?: Database["public"]["Enums"]["item_kind"]
          name?: string
          revive_hp_percent?: number | null
          sell_price?: number | null
          sort_order?: number
          stone_type?: Database["public"]["Enums"]["element_type"] | null
        }
        Relationships: []
      }
      location_encounters: {
        Row: {
          level: number
          location_id: string
          period: Database["public"]["Enums"]["day_period"]
          slot: number
          species_id: string
        }
        Insert: {
          level: number
          location_id: string
          period: Database["public"]["Enums"]["day_period"]
          slot: number
          species_id: string
        }
        Update: {
          level?: number
          location_id?: string
          period?: Database["public"]["Enums"]["day_period"]
          slot?: number
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_encounters_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_encounters_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          encounter_chance_day: number | null
          encounter_chance_morn: number | null
          encounter_chance_nite: number | null
          fishing_group: string | null
          id: string
          name: string
        }
        Insert: {
          encounter_chance_day?: number | null
          encounter_chance_morn?: number | null
          encounter_chance_nite?: number | null
          fishing_group?: string | null
          id: string
          name: string
        }
        Update: {
          encounter_chance_day?: number | null
          encounter_chance_morn?: number | null
          encounter_chance_nite?: number | null
          fishing_group?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      mail_messages: {
        Row: {
          anexo_coletado_em: string | null
          anexo_itens: Json
          assunto: string | null
          corpo: string
          created_at: string
          de_id: string | null
          de_nome: string
          estado: string
          excluido_destinatario_em: string | null
          excluido_remetente_em: string | null
          id: string
          para_id: string
          read_at: string | null
          tipo: string
        }
        Insert: {
          anexo_coletado_em?: string | null
          anexo_itens?: Json
          assunto?: string | null
          corpo?: string
          created_at?: string
          de_id?: string | null
          de_nome: string
          estado?: string
          excluido_destinatario_em?: string | null
          excluido_remetente_em?: string | null
          id?: string
          para_id: string
          read_at?: string | null
          tipo: string
        }
        Update: {
          anexo_coletado_em?: string | null
          anexo_itens?: Json
          assunto?: string | null
          corpo?: string
          created_at?: string
          de_id?: string | null
          de_nome?: string
          estado?: string
          excluido_destinatario_em?: string | null
          excluido_remetente_em?: string | null
          id?: string
          para_id?: string
          read_at?: string | null
          tipo?: string
        }
        Relationships: []
      }
      map_encounters: {
        Row: {
          map_id: string
          max_level: number
          min_level: number
          sort_order: number
          species_id: string
          weight: number
        }
        Insert: {
          map_id: string
          max_level: number
          min_level: number
          sort_order?: number
          species_id: string
          weight: number
        }
        Update: {
          map_id?: string
          max_level?: number
          min_level?: number
          sort_order?: number
          species_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_encounters_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_encounters_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      maps: {
        Row: {
          bg_theme: string
          bounds_height: number
          bounds_width: number
          continent: Database["public"]["Enums"]["map_continent"]
          id: string
          max_level: number
          min_level: number
          name: string
          sort_order: number
          unlock_cost: number | null
        }
        Insert: {
          bg_theme: string
          bounds_height?: number
          bounds_width?: number
          continent: Database["public"]["Enums"]["map_continent"]
          id: string
          max_level: number
          min_level: number
          name: string
          sort_order?: number
          unlock_cost?: number | null
        }
        Update: {
          bg_theme?: string
          bounds_height?: number
          bounds_width?: number
          continent?: Database["public"]["Enums"]["map_continent"]
          id?: string
          max_level?: number
          min_level?: number
          name?: string
          sort_order?: number
          unlock_cost?: number | null
        }
        Relationships: []
      }
      market_deliveries: {
        Row: {
          claimed_at: string | null
          created_at: string
          diamonds: number
          gold: number
          id: string
          item_id: string | null
          motivo: string
          quantity: number
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          diamonds?: number
          gold?: number
          id?: string
          item_id?: string | null
          motivo: string
          quantity?: number
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          diamonds?: number
          gold?: number
          id?: string
          item_id?: string | null
          motivo?: string
          quantity?: number
          user_id?: string
        }
        Relationships: []
      }
      market_listings: {
        Row: {
          apenas_oferta: boolean
          buyer_id: string | null
          created_at: string
          currency: string
          expira_em: string | null
          id: string
          incremento_minimo: number | null
          is_shiny: boolean
          iv_percent: number
          lance_minimo: number | null
          level: number
          modo: string
          poke_uid: string | null
          price: number | null
          rarity: Database["public"]["Enums"]["rarity_tier"]
          seller_id: string
          sold_at: string | null
          species_id: string
          status: string
        }
        Insert: {
          apenas_oferta?: boolean
          buyer_id?: string | null
          created_at?: string
          currency: string
          expira_em?: string | null
          id?: string
          incremento_minimo?: number | null
          is_shiny?: boolean
          iv_percent?: number
          lance_minimo?: number | null
          level: number
          modo?: string
          poke_uid?: string | null
          price?: number | null
          rarity: Database["public"]["Enums"]["rarity_tier"]
          seller_id: string
          sold_at?: string | null
          species_id: string
          status?: string
        }
        Update: {
          apenas_oferta?: boolean
          buyer_id?: string | null
          created_at?: string
          currency?: string
          expira_em?: string | null
          id?: string
          incremento_minimo?: number | null
          is_shiny?: boolean
          iv_percent?: number
          lance_minimo?: number | null
          level?: number
          modo?: string
          poke_uid?: string | null
          price?: number | null
          rarity?: Database["public"]["Enums"]["rarity_tier"]
          seller_id?: string
          sold_at?: string | null
          species_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_listings_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "pokemon_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listings_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "ranking_pokemon"
            referencedColumns: ["id"]
          },
        ]
      }
      market_offers: {
        Row: {
          buyer_id: string
          created_at: string
          currency: string
          id: string
          listing_id: string
          resolved_at: string | null
          status: string
          valor: number
        }
        Insert: {
          buyer_id: string
          created_at?: string
          currency: string
          id?: string
          listing_id: string
          resolved_at?: string | null
          status?: string
          valor: number
        }
        Update: {
          buyer_id?: string
          created_at?: string
          currency?: string
          id?: string
          listing_id?: string
          resolved_at?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "mercado_anuncios_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      market_orders: {
        Row: {
          closed_at: string | null
          created_at: string
          gold_retido: number
          id: string
          item_id: string
          quantity: number
          remaining: number
          side: string
          status: string
          unit_price: number
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          gold_retido?: number
          id?: string
          item_id: string
          quantity: number
          remaining: number
          side: string
          status?: string
          unit_price: number
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          gold_retido?: number
          id?: string
          item_id?: string
          quantity?: number
          remaining?: number
          side?: string
          status?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: []
      }
      market_trades: {
        Row: {
          buyer_id: string | null
          created_at: string
          currency: string
          id: string
          item_id: string | null
          kind: string
          quantity: number
          seller_id: string | null
          species_id: string | null
          taxa: number
          unit_price: number
        }
        Insert: {
          buyer_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          item_id?: string | null
          kind: string
          quantity?: number
          seller_id?: string | null
          species_id?: string | null
          taxa?: number
          unit_price: number
        }
        Update: {
          buyer_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          item_id?: string | null
          kind?: string
          quantity?: number
          seller_id?: string | null
          species_id?: string | null
          taxa?: number
          unit_price?: number
        }
        Relationships: []
      }
      moves: {
        Row: {
          accuracy: number
          always_hits: boolean
          aoe_radius: number | null
          category: Database["public"]["Enums"]["move_category"]
          fixed_damage_mode: string | null
          id: string
          multi_hit: boolean
          name: string
          power: number
          pp: number
          priority: number
          recoil_fraction: number | null
          target: Database["public"]["Enums"]["move_target"]
          type: Database["public"]["Enums"]["element_type"]
        }
        Insert: {
          accuracy: number
          always_hits?: boolean
          aoe_radius?: number | null
          category: Database["public"]["Enums"]["move_category"]
          fixed_damage_mode?: string | null
          id: string
          multi_hit?: boolean
          name: string
          power: number
          pp: number
          priority?: number
          recoil_fraction?: number | null
          target?: Database["public"]["Enums"]["move_target"]
          type: Database["public"]["Enums"]["element_type"]
        }
        Update: {
          accuracy?: number
          always_hits?: boolean
          aoe_radius?: number | null
          category?: Database["public"]["Enums"]["move_category"]
          fixed_damage_mode?: string | null
          id?: string
          multi_hit?: boolean
          name?: string
          power?: number
          pp?: number
          priority?: number
          recoil_fraction?: number | null
          target?: Database["public"]["Enums"]["move_target"]
          type?: Database["public"]["Enums"]["element_type"]
        }
        Relationships: []
      }
      player_auto_catch_rules: {
        Row: {
          ball_item_id: string
          created_at: string
          id: string
          species_id: string
          user_id: string
        }
        Insert: {
          ball_item_id: string
          created_at?: string
          id?: string
          species_id: string
          user_id: string
        }
        Update: {
          ball_item_id?: string
          created_at?: string
          id?: string
          species_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_auto_catch_rules_ball_item_id_fkey"
            columns: ["ball_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_auto_catch_rules_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_auto_catch_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "player_auto_catch_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      player_items: {
        Row: {
          item_id: string
          locked: boolean
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          item_id: string
          locked?: boolean
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          item_id?: string
          locked?: boolean
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "player_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      player_pokedex: {
        Row: {
          normal_kills: number
          shiny_kills: number
          species_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          normal_kills?: number
          shiny_kills?: number
          species_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          normal_kills?: number
          shiny_kills?: number
          species_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_pokedex_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_pokedex_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "player_pokedex_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      players: {
        Row: {
          active_team_index: number
          auto_catch_config: Json
          auto_pot_rules: Json
          auto_sell_config: Json
          auto_status_config: Json
          auto_toggles: Json
          created_at: string
          current_map_id: string | null
          diamonds: number
          gold: number
          perf_stats: Json
          trainer_exp: number
          trainer_level: number
          trainer_name: string
          unlocked_continents: string[]
          unlocked_maps: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active_team_index?: number
          auto_catch_config?: Json
          auto_pot_rules?: Json
          auto_sell_config?: Json
          auto_status_config?: Json
          auto_toggles?: Json
          created_at?: string
          current_map_id?: string | null
          diamonds?: number
          gold?: number
          perf_stats?: Json
          trainer_exp?: number
          trainer_level?: number
          trainer_name?: string
          unlocked_continents?: string[]
          unlocked_maps?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active_team_index?: number
          auto_catch_config?: Json
          auto_pot_rules?: Json
          auto_sell_config?: Json
          auto_status_config?: Json
          auto_toggles?: Json
          created_at?: string
          current_map_id?: string | null
          diamonds?: number
          gold?: number
          perf_stats?: Json
          trainer_exp?: number
          trainer_level?: number
          trainer_name?: string
          unlocked_continents?: string[]
          unlocked_maps?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pokemon_instances: {
        Row: {
          active_abilities: string[] | null
          created_at: string
          disabled_abilities: Json
          exp: number
          hp: number
          id: string
          is_shiny: boolean
          iv_atk_esp: number
          iv_atk_fis: number
          iv_def: number
          iv_def_esp: number
          iv_hp: number
          iv_speed: number
          level: number
          location: Database["public"]["Enums"]["pokemon_location"]
          locked: boolean
          nature: string | null
          original_trainer: string | null
          rarity: Database["public"]["Enums"]["rarity_tier"]
          species_id: string
          stat_atk_esp: number
          stat_atk_fis: number
          stat_def: number
          stat_def_esp: number
          stat_hp: number
          stat_speed: number
          status: string | null
          status_turns: number | null
          team_slot: number | null
          trait: string | null
          unlocked_abilities: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active_abilities?: string[] | null
          created_at?: string
          disabled_abilities?: Json
          exp?: number
          hp: number
          id?: string
          is_shiny?: boolean
          iv_atk_esp: number
          iv_atk_fis: number
          iv_def: number
          iv_def_esp: number
          iv_hp: number
          iv_speed: number
          level?: number
          location: Database["public"]["Enums"]["pokemon_location"]
          locked?: boolean
          nature?: string | null
          original_trainer?: string | null
          rarity?: Database["public"]["Enums"]["rarity_tier"]
          species_id: string
          stat_atk_esp: number
          stat_atk_fis: number
          stat_def: number
          stat_def_esp: number
          stat_hp: number
          stat_speed: number
          status?: string | null
          status_turns?: number | null
          team_slot?: number | null
          trait?: string | null
          unlocked_abilities?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active_abilities?: string[] | null
          created_at?: string
          disabled_abilities?: Json
          exp?: number
          hp?: number
          id?: string
          is_shiny?: boolean
          iv_atk_esp?: number
          iv_atk_fis?: number
          iv_def?: number
          iv_def_esp?: number
          iv_hp?: number
          iv_speed?: number
          level?: number
          location?: Database["public"]["Enums"]["pokemon_location"]
          locked?: boolean
          nature?: string | null
          original_trainer?: string | null
          rarity?: Database["public"]["Enums"]["rarity_tier"]
          species_id?: string
          stat_atk_esp?: number
          stat_atk_fis?: number
          stat_def?: number
          stat_def_esp?: number
          stat_hp?: number
          stat_speed?: number
          status?: string | null
          status_turns?: number | null
          team_slot?: number | null
          trait?: string | null
          unlocked_abilities?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pokemon_instances_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pokemon_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pokemon_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      spawn_tiers: {
        Row: {
          key: string
          sort_order: number
          weight: number
        }
        Insert: {
          key: string
          sort_order: number
          weight: number
        }
        Update: {
          key?: string
          sort_order?: number
          weight?: number
        }
        Relationships: []
      }
      species: {
        Row: {
          base_atk_esp: number
          base_atk_fis: number
          base_def: number
          base_def_esp: number
          base_exp: number
          base_hp: number
          base_speed: number
          catch_rate: number
          dex_number: number
          evolves_at_level: number | null
          evolves_to: string | null
          growth_curve: string
          height_m: number | null
          id: string
          is_legendary: boolean
          is_special_evolution: boolean
          name: string
          spawn_tier: string
          type1: Database["public"]["Enums"]["element_type"]
          type2: Database["public"]["Enums"]["element_type"] | null
        }
        Insert: {
          base_atk_esp: number
          base_atk_fis: number
          base_def: number
          base_def_esp: number
          base_exp: number
          base_hp: number
          base_speed: number
          catch_rate: number
          dex_number: number
          evolves_at_level?: number | null
          evolves_to?: string | null
          growth_curve: string
          height_m?: number | null
          id: string
          is_legendary?: boolean
          is_special_evolution?: boolean
          name: string
          spawn_tier: string
          type1: Database["public"]["Enums"]["element_type"]
          type2?: Database["public"]["Enums"]["element_type"] | null
        }
        Update: {
          base_atk_esp?: number
          base_atk_fis?: number
          base_def?: number
          base_def_esp?: number
          base_exp?: number
          base_hp?: number
          base_speed?: number
          catch_rate?: number
          dex_number?: number
          evolves_at_level?: number | null
          evolves_to?: string | null
          growth_curve?: string
          height_m?: number | null
          id?: string
          is_legendary?: boolean
          is_special_evolution?: boolean
          name?: string
          spawn_tier?: string
          type1?: Database["public"]["Enums"]["element_type"]
          type2?: Database["public"]["Enums"]["element_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "species_evolves_to_fkey"
            columns: ["evolves_to"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "species_spawn_tier_fkey"
            columns: ["spawn_tier"]
            isOneToOne: false
            referencedRelation: "spawn_tiers"
            referencedColumns: ["key"]
          },
        ]
      }
      species_evolution_options: {
        Row: {
          evolves_at_level: number
          evolves_to: string
          is_special_evolution: boolean
          ordem: number
          species_id: string
        }
        Insert: {
          evolves_at_level: number
          evolves_to: string
          is_special_evolution?: boolean
          ordem?: number
          species_id: string
        }
        Update: {
          evolves_at_level?: number
          evolves_to?: string
          is_special_evolution?: boolean
          ordem?: number
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "species_evolution_options_evolves_to_fkey"
            columns: ["evolves_to"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "species_evolution_options_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      species_moves: {
        Row: {
          level_req: number
          move_id: string
          sort_order: number
          species_id: string
        }
        Insert: {
          level_req: number
          move_id: string
          sort_order?: number
          species_id: string
        }
        Update: {
          level_req?: number
          move_id?: string
          sort_order?: number
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "species_moves_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "species_moves_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      tempo_jogado_arquivado: {
        Row: {
          atualizado_em: string
          segundos: number
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          segundos?: number
          user_id: string
        }
        Update: {
          atualizado_em?: string
          segundos?: number
          user_id?: string
        }
        Relationships: []
      }
      type_chart: {
        Row: {
          attacking_type: Database["public"]["Enums"]["element_type"]
          defending_type: Database["public"]["Enums"]["element_type"]
          multiplier: number
        }
        Insert: {
          attacking_type: Database["public"]["Enums"]["element_type"]
          defending_type: Database["public"]["Enums"]["element_type"]
          multiplier: number
        }
        Update: {
          attacking_type?: Database["public"]["Enums"]["element_type"]
          defending_type?: Database["public"]["Enums"]["element_type"]
          multiplier?: number
        }
        Relationships: []
      }
    }
    Views: {
      mercado_anuncios_ativos: {
        Row: {
          apenas_oferta: boolean | null
          buyer_id: string | null
          created_at: string | null
          currency: string | null
          expira_em: string | null
          id: string | null
          incremento_minimo: number | null
          is_shiny: boolean | null
          iv_percent: number | null
          lance_minimo: number | null
          level: number | null
          melhor_oferta: number | null
          modo: string | null
          ofertas: number | null
          poke_uid: string | null
          price: number | null
          rarity: Database["public"]["Enums"]["rarity_tier"] | null
          seller_id: string | null
          sold_at: string | null
          species_id: string | null
          status: string | null
          vendedor: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_listings_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "pokemon_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listings_poke_uid_fkey"
            columns: ["poke_uid"]
            isOneToOne: false
            referencedRelation: "ranking_pokemon"
            referencedColumns: ["id"]
          },
        ]
      }
      mercado_historico_itens: {
        Row: {
          currency: string | null
          dia: string | null
          item_id: string | null
          maximo: number | null
          mediana: number | null
          minimo: number | null
          negocios: number | null
          volume: number | null
        }
        Relationships: []
      }
      mercado_historico_pokes: {
        Row: {
          currency: string | null
          dia: string | null
          maximo: number | null
          mediana: number | null
          minimo: number | null
          negocios: number | null
          species_id: string | null
          volume: number | null
        }
        Relationships: []
      }
      mercado_ofertas_recebidas: {
        Row: {
          buyer_id: string | null
          comprador: string | null
          created_at: string | null
          currency: string | null
          id: string | null
          is_shiny: boolean | null
          level: number | null
          listing_id: string | null
          resolved_at: string | null
          seller_id: string | null
          species_id: string | null
          status: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "mercado_anuncios_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      mercado_resumo_historico_itens: {
        Row: {
          currency: string | null
          item_id: string | null
          mediana_24h: number | null
          mediana_7d: number | null
          negocios_30d: number | null
          volume_24h: number | null
          volume_30d: number | null
        }
        Relationships: []
      }
      mercado_resumo_historico_pokes: {
        Row: {
          currency: string | null
          mediana_24h: number | null
          mediana_7d: number | null
          negocios_30d: number | null
          species_id: string | null
          volume_24h: number | null
          volume_30d: number | null
        }
        Relationships: []
      }
      mercado_resumo_itens: {
        Row: {
          em_compra: number | null
          em_venda: number | null
          item_id: string | null
          melhor_compra: number | null
          melhor_venda: number | null
        }
        Relationships: []
      }
      ranking_pokemon: {
        Row: {
          created_at: string | null
          disabled_abilities: Json | null
          exp: number | null
          hp: number | null
          id: string | null
          is_shiny: boolean | null
          iv_atk_esp: number | null
          iv_atk_fis: number | null
          iv_def: number | null
          iv_def_esp: number | null
          iv_hp: number | null
          iv_speed: number | null
          level: number | null
          location: Database["public"]["Enums"]["pokemon_location"] | null
          locked: boolean | null
          original_trainer: string | null
          rarity: Database["public"]["Enums"]["rarity_tier"] | null
          species_id: string | null
          stat_atk_esp: number | null
          stat_atk_fis: number | null
          stat_def: number | null
          stat_def_esp: number | null
          stat_hp: number | null
          stat_speed: number | null
          team_slot: number | null
          treinador: string | null
          unlocked_abilities: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pokemon_instances_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pokemon_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pokemon_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "treinadores_publico"
            referencedColumns: ["user_id"]
          },
        ]
      }
      treinadores_publico: {
        Row: {
          trainer_exp: number | null
          trainer_level: number | null
          trainer_name: string | null
          user_id: string | null
        }
        Insert: {
          trainer_exp?: number | null
          trainer_level?: number | null
          trainer_name?: string | null
          user_id?: string | null
        }
        Update: {
          trainer_exp?: number | null
          trainer_level?: number | null
          trainer_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _calcular_stat: {
        Args: {
          p_base: number
          p_is_hp: boolean
          p_iv: number
          p_level: number
        }
        Returns: number
      }
      _calcular_stats:
        | {
            Args: {
              p_is_shiny: boolean
              p_iv_atk_esp: number
              p_iv_atk_fis: number
              p_iv_def: number
              p_iv_def_esp: number
              p_iv_hp: number
              p_iv_speed: number
              p_level: number
              p_rarity: string
              p_species: Database["public"]["Tables"]["species"]["Row"]
            }
            Returns: {
              stat_atk_esp: number
              stat_atk_fis: number
              stat_def: number
              stat_def_esp: number
              stat_hp: number
              stat_speed: number
            }[]
          }
        | {
            Args: {
              p_is_shiny: boolean
              p_iv_atk_esp: number
              p_iv_atk_fis: number
              p_iv_def: number
              p_iv_def_esp: number
              p_iv_hp: number
              p_iv_speed: number
              p_level: number
              p_nature: string
              p_rarity: string
              p_species: Database["public"]["Tables"]["species"]["Row"]
            }
            Returns: {
              stat_atk_esp: number
              stat_atk_fis: number
              stat_def: number
              stat_def_esp: number
              stat_hp: number
              stat_speed: number
            }[]
          }
      _mult_natureza: {
        Args: { p_nature: string; p_stat: string }
        Returns: number
      }
      _valor_venda_poke: {
        Args: { p_base_exp: number; p_level: number; p_rarity: string }
        Returns: number
      }
      alternar_habilidade: {
        Args: { p_ability_id: string; p_poke_id: string }
        Returns: Json
      }
      alternar_trava_item: { Args: { p_item_id: string }; Returns: Json }
      alternar_trava_poke: { Args: { p_poke_id: string }; Returns: Json }
      amigos_detalhados: { Args: never; Returns: Json }
      anunciar_poke: {
        Args: {
          p_apenas_oferta: boolean
          p_currency: string
          p_poke_id: string
          p_price: number
        }
        Returns: Json
      }
      bloquear_jogador: { Args: { p_alvo_id: string }; Returns: Json }
      bloqueio_entre: { Args: { p_a: string; p_b: string }; Returns: boolean }
      cancelar_anuncio: { Args: { p_anuncio_id: string }; Returns: Json }
      cancelar_oferta: { Args: { p_oferta_id: string }; Returns: Json }
      cancelar_ordem_mercado: { Args: { p_ordem_id: string }; Returns: Json }
      coletar_anexo_correio: { Args: { p_mensagem_id: string }; Returns: Json }
      comprar_anuncio: { Args: { p_anuncio_id: string }; Returns: Json }
      comprar_item: {
        Args: { p_item_id: string; p_qtd?: number }
        Returns: Json
      }
      concessao_inicial_de_itens: {
        Args: never
        Returns: {
          item_id: string
          quantity: number
        }[]
      }
      configurar_auto: { Args: { p_patch: Json }; Returns: Json }
      conversas: { Args: never; Returns: Json }
      criar_leilao: {
        Args: {
          p_currency: string
          p_horas: number
          p_incremento_minimo: number
          p_lance_minimo: number
          p_poke_id: string
        }
        Returns: Json
      }
      criar_ordem_mercado: {
        Args: {
          p_item_id: string
          p_quantity: number
          p_side: string
          p_unit_price: number
        }
        Returns: Json
      }
      curar_equipe: { Args: never; Returns: Json }
      dar_lance: {
        Args: { p_anuncio_id: string; p_valor: number }
        Returns: Json
      }
      definir_ativo: { Args: { p_poke_id: string }; Returns: Json }
      definir_golpes_ativos: {
        Args: { p_ability_ids: string[]; p_poke_id: string }
        Returns: Json
      }
      definir_nome_do_treinador: { Args: { p_nome: string }; Returns: Json }
      desbloquear_hunt: { Args: { p_map_id: string }; Returns: Json }
      desbloquear_jogador: { Args: { p_alvo_id: string }; Returns: Json }
      encerrar_leiloes_vencidos: { Args: { p_limite?: number }; Returns: Json }
      enviar_mensagem: {
        Args: {
          p_anexos?: Json
          p_corpo: string
          p_para_id?: string
          p_para_nick?: string
        }
        Returns: Json
      }
      escolher_starter: { Args: { p_species_id: string }; Returns: Json }
      esta_online: { Args: { p_user_id: string }; Returns: boolean }
      evoluir_poke:
        | { Args: { p_poke_id: string }; Returns: Json }
        | { Args: { p_alvo?: string; p_poke_id: string }; Returns: Json }
      excluir_conversa: { Args: { p_contato_id: string }; Returns: Json }
      excluir_correio: { Args: { p_mensagem_id: string }; Returns: Json }
      gravar_progresso: {
        Args: {
          p_patch: Json
          p_updated_at_esperado: string
          p_user_id: string
        }
        Returns: Json
      }
      hunts_iniciais: { Args: never; Returns: string[] }
      id_por_nome_de_treinador: { Args: { nome: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      marcar_conversa_lida: { Args: { p_contato_id: string }; Returns: Json }
      marcar_correio_lido: { Args: { p_mensagem_id: string }; Returns: Json }
      meu_perfil: { Args: never; Returns: Json }
      nome_de_treinador_disponivel: { Args: { nome: string }; Returns: boolean }
      ofertar_no_anuncio: {
        Args: { p_anuncio_id: string; p_valor: number }
        Returns: Json
      }
      pedir_amizade: { Args: { p_nick: string }; Returns: Json }
      por_na_equipe: { Args: { p_poke_id: string }; Returns: Json }
      recusar_ofertas_pendentes: {
        Args: { p_anuncio_id: string; p_exceto?: string; p_motivo: string }
        Returns: number
      }
      registrar_evento_auditoria: {
        Args: {
          p_contexto?: Json
          p_mensagem: string
          p_nivel?: string
          p_rota: string
        }
        Returns: undefined
      }
      reiniciar_jogo: { Args: never; Returns: undefined }
      remover_amizade: { Args: { p_amigo_id: string }; Returns: Json }
      reordenar_equipe: { Args: { p_ordem: string[] }; Returns: Json }
      responder_oferta: {
        Args: { p_aceitar: boolean; p_oferta_id: string }
        Returns: Json
      }
      responder_pedido_amizade: {
        Args: { p_aceitar: boolean; p_mensagem_id: string }
        Returns: Json
      }
      taxa_de_venda: {
        Args: { p_currency: string; p_valor: number }
        Returns: number
      }
      taxa_do_mercado: { Args: never; Returns: Json }
      tem_outra_sessao_de_auth_ativa: { Args: never; Returns: boolean }
      tirar_da_equipe: { Args: { p_poke_id: string }; Returns: Json }
      usar_item: { Args: { p_item_id: string }; Returns: Json }
      vender_item: {
        Args: { p_item_id: string; p_qtd?: number }
        Returns: Json
      }
      vender_poke: { Args: { p_poke_id: string }; Returns: Json }
      vender_pokes: { Args: { p_poke_ids: string[] }; Returns: Json }
      vender_todos_itens: { Args: never; Returns: Json }
      wipe_inventario_e_economia: {
        Args: never
        Returns: {
          jogadores_afetados: number
          linhas_de_item_apagadas: number
        }[]
      }
      wipe_mundo_social: {
        Args: never
        Returns: {
          amizades: number
          anuncios: number
          chat: number
          entregas: number
          mensagens: number
          negocios: number
          ordens: number
        }[]
      }
      wipe_todos_os_saves: {
        Args: never
        Returns: {
          jogadores_resetados: number
          pokes_apagados: number
          sessoes_fechadas: number
        }[]
      }
    }
    Enums: {
      admin_role: "support" | "owner"
      day_period: "morn" | "day" | "nite"
      element_type:
        | "NORMAL"
        | "FIRE"
        | "WATER"
        | "ELECTRIC"
        | "GRASS"
        | "ICE"
        | "FIGHTING"
        | "POISON"
        | "GROUND"
        | "FLYING"
        | "PSYCHIC"
        | "BUG"
        | "ROCK"
        | "GHOST"
        | "DRAGON"
        | "DARK"
        | "STEEL"
        | "FAIRY"
      item_kind: "ball" | "potion" | "revive" | "rod" | "stone" | "status_heal"
      map_continent: "johto" | "kanto"
      move_category: "physical" | "special"
      move_target: "single" | "aoe"
      pokemon_location: "team" | "bag" | "market"
      rarity_tier:
        | "comum"
        | "incomum"
        | "raro"
        | "ultra"
        | "legendary"
        | "mythic"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  dev: {
    Enums: {
      admin_role: ["support", "owner"],
      day_period: ["morn", "day", "nite"],
      element_type: [
        "NORMAL",
        "FIRE",
        "WATER",
        "ELECTRIC",
        "GRASS",
        "ICE",
        "FIGHTING",
        "POISON",
        "GROUND",
        "FLYING",
        "PSYCHIC",
        "BUG",
        "ROCK",
        "GHOST",
        "DRAGON",
        "DARK",
        "STEEL",
        "FAIRY",
      ],
      item_kind: ["ball", "potion", "revive", "rod", "stone", "status_heal"],
      map_continent: ["johto", "kanto"],
      move_category: ["physical", "special"],
      move_target: ["single", "aoe"],
      pokemon_location: ["team", "bag", "market"],
      rarity_tier: ["comum", "incomum", "raro", "ultra", "legendary", "mythic"],
    },
  },
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_role: ["support", "owner"],
      day_period: ["morn", "day", "nite"],
      element_type: [
        "NORMAL",
        "FIRE",
        "WATER",
        "ELECTRIC",
        "GRASS",
        "ICE",
        "FIGHTING",
        "POISON",
        "GROUND",
        "FLYING",
        "PSYCHIC",
        "BUG",
        "ROCK",
        "GHOST",
        "DRAGON",
        "DARK",
        "STEEL",
        "FAIRY",
      ],
      item_kind: ["ball", "potion", "revive", "rod", "stone", "status_heal"],
      map_continent: ["johto", "kanto"],
      move_category: ["physical", "special"],
      move_target: ["single", "aoe"],
      pokemon_location: ["team", "bag", "market"],
      rarity_tier: ["comum", "incomum", "raro", "ultra", "legendary", "mythic"],
    },
  },
} as const
