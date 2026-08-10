export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          closed_at: string | null
          flushing_since: string | null
          id: string
          last_flush_at: string
          map_id: string
          poke_uid: string
          rng_draws: number
          rng_state: number
          seed: number
          simulated_seconds: number
          started_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          flushing_since?: string | null
          id?: string
          last_flush_at?: string
          map_id: string
          poke_uid: string
          rng_draws?: number
          rng_state: number
          seed: number
          simulated_seconds?: number
          started_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          flushing_since?: string | null
          id?: string
          last_flush_at?: string
          map_id?: string
          poke_uid?: string
          rng_draws?: number
          rng_state?: number
          seed?: number
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
        ]
      }
      items: {
        Row: {
          buy_price: number | null
          capture_rate: number | null
          description: string | null
          heal_amount: number | null
          heals_full: boolean
          id: string
          kind: Database["dev"]["Enums"]["item_kind"]
          name: string
          revive_hp_percent: number | null
          sort_order: number
          stone_type: Database["dev"]["Enums"]["element_type"] | null
        }
        Insert: {
          buy_price?: number | null
          capture_rate?: number | null
          description?: string | null
          heal_amount?: number | null
          heals_full?: boolean
          id: string
          kind: Database["dev"]["Enums"]["item_kind"]
          name: string
          revive_hp_percent?: number | null
          sort_order?: number
          stone_type?: Database["dev"]["Enums"]["element_type"] | null
        }
        Update: {
          buy_price?: number | null
          capture_rate?: number | null
          description?: string | null
          heal_amount?: number | null
          heals_full?: boolean
          id?: string
          kind?: Database["dev"]["Enums"]["item_kind"]
          name?: string
          revive_hp_percent?: number | null
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
          assunto: string
          corpo: string
          created_at: string
          de_id: string | null
          de_nome: string
          estado: string
          id: string
          para_id: string
          read_at: string | null
          tipo: string
        }
        Insert: {
          anexo_coletado_em?: string | null
          anexo_itens?: Json
          assunto: string
          corpo?: string
          created_at?: string
          de_id?: string | null
          de_nome: string
          estado?: string
          id?: string
          para_id: string
          read_at?: string | null
          tipo: string
        }
        Update: {
          anexo_coletado_em?: string | null
          anexo_itens?: Json
          assunto?: string
          corpo?: string
          created_at?: string
          de_id?: string | null
          de_nome?: string
          estado?: string
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
          id: string
          is_shiny: boolean
          iv_percent: number
          level: number
          poke_uid: string
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
          id?: string
          is_shiny?: boolean
          iv_percent?: number
          level: number
          poke_uid: string
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
          id?: string
          is_shiny?: boolean
          iv_percent?: number
          level?: number
          poke_uid?: string
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
        ]
      }
      players: {
        Row: {
          active_team_index: number
          auto_catch_config: Json
          auto_pot_rules: Json
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
          original_trainer: string | null
          rarity: Database["dev"]["Enums"]["rarity_tier"]
          species_id: string
          stat_atk_esp: number
          stat_atk_fis: number
          stat_def: number
          stat_def_esp: number
          stat_hp: number
          stat_speed: number
          team_slot: number | null
          unlocked_abilities: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
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
          original_trainer?: string | null
          rarity?: Database["dev"]["Enums"]["rarity_tier"]
          species_id: string
          stat_atk_esp: number
          stat_atk_fis: number
          stat_def: number
          stat_def_esp: number
          stat_hp: number
          stat_speed: number
          team_slot?: number | null
          unlocked_abilities?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
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
          original_trainer?: string | null
          rarity?: Database["dev"]["Enums"]["rarity_tier"]
          species_id?: string
          stat_atk_esp?: number
          stat_atk_fis?: number
          stat_def?: number
          stat_def_esp?: number
          stat_hp?: number
          stat_speed?: number
          team_slot?: number | null
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
      [_ in never]: never
    }
    Functions: {
      concessao_inicial_de_itens: {
        Args: never
        Returns: {
          item_id: string
          quantity: number
        }[]
      }
      hunts_iniciais: { Args: never; Returns: string[] }
      id_por_nome_de_treinador: { Args: { nome: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      nome_de_treinador_disponivel: { Args: { nome: string }; Returns: boolean }
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
      item_kind: "ball" | "potion" | "revive" | "rod" | "stone"
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
          closed_at: string | null
          id: string
          last_flush_at: string
          map_id: string
          poke_uid: string
          rng_draws: number
          rng_state: number
          seed: number
          simulated_seconds: number
          started_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          id?: string
          last_flush_at?: string
          map_id: string
          poke_uid: string
          rng_draws?: number
          rng_state: number
          seed: number
          simulated_seconds?: number
          started_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          id?: string
          last_flush_at?: string
          map_id?: string
          poke_uid?: string
          rng_draws?: number
          rng_state?: number
          seed?: number
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
        ]
      }
      items: {
        Row: {
          buy_price: number | null
          capture_rate: number | null
          description: string | null
          heal_amount: number | null
          heals_full: boolean
          id: string
          kind: Database["public"]["Enums"]["item_kind"]
          name: string
          revive_hp_percent: number | null
          sort_order: number
          stone_type: Database["public"]["Enums"]["element_type"] | null
        }
        Insert: {
          buy_price?: number | null
          capture_rate?: number | null
          description?: string | null
          heal_amount?: number | null
          heals_full?: boolean
          id: string
          kind: Database["public"]["Enums"]["item_kind"]
          name: string
          revive_hp_percent?: number | null
          sort_order?: number
          stone_type?: Database["public"]["Enums"]["element_type"] | null
        }
        Update: {
          buy_price?: number | null
          capture_rate?: number | null
          description?: string | null
          heal_amount?: number | null
          heals_full?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["item_kind"]
          name?: string
          revive_hp_percent?: number | null
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
          assunto: string
          corpo: string
          created_at: string
          de_id: string | null
          de_nome: string
          estado: string
          id: string
          para_id: string
          read_at: string | null
          tipo: string
        }
        Insert: {
          anexo_coletado_em?: string | null
          anexo_itens?: Json
          assunto: string
          corpo?: string
          created_at?: string
          de_id?: string | null
          de_nome: string
          estado?: string
          id?: string
          para_id: string
          read_at?: string | null
          tipo: string
        }
        Update: {
          anexo_coletado_em?: string | null
          anexo_itens?: Json
          assunto?: string
          corpo?: string
          created_at?: string
          de_id?: string | null
          de_nome?: string
          estado?: string
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
          id: string
          is_shiny: boolean
          iv_percent: number
          level: number
          poke_uid: string
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
          id?: string
          is_shiny?: boolean
          iv_percent?: number
          level: number
          poke_uid: string
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
          id?: string
          is_shiny?: boolean
          iv_percent?: number
          level?: number
          poke_uid?: string
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
        ]
      }
      players: {
        Row: {
          active_team_index: number
          auto_catch_config: Json
          auto_pot_rules: Json
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
          original_trainer: string | null
          rarity: Database["public"]["Enums"]["rarity_tier"]
          species_id: string
          stat_atk_esp: number
          stat_atk_fis: number
          stat_def: number
          stat_def_esp: number
          stat_hp: number
          stat_speed: number
          team_slot: number | null
          unlocked_abilities: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
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
          original_trainer?: string | null
          rarity?: Database["public"]["Enums"]["rarity_tier"]
          species_id: string
          stat_atk_esp: number
          stat_atk_fis: number
          stat_def: number
          stat_def_esp: number
          stat_hp: number
          stat_speed: number
          team_slot?: number | null
          unlocked_abilities?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
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
          original_trainer?: string | null
          rarity?: Database["public"]["Enums"]["rarity_tier"]
          species_id?: string
          stat_atk_esp?: number
          stat_atk_fis?: number
          stat_def?: number
          stat_def_esp?: number
          stat_hp?: number
          stat_speed?: number
          team_slot?: number | null
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
      [_ in never]: never
    }
    Functions: {
      concessao_inicial_de_itens: {
        Args: never
        Returns: {
          item_id: string
          quantity: number
        }[]
      }
      hunts_iniciais: { Args: never; Returns: string[] }
      id_por_nome_de_treinador: { Args: { nome: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      nome_de_treinador_disponivel: { Args: { nome: string }; Returns: boolean }
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
      item_kind: "ball" | "potion" | "revive" | "rod" | "stone"
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
      ],
      item_kind: ["ball", "potion", "revive", "rod", "stone"],
      map_continent: ["johto", "kanto"],
      move_category: ["physical", "special"],
      move_target: ["single", "aoe"],
      pokemon_location: ["team", "bag", "market"],
      rarity_tier: ["comum", "incomum", "raro", "ultra", "legendary", "mythic"],
    },
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
      ],
      item_kind: ["ball", "potion", "revive", "rod", "stone"],
      map_continent: ["johto", "kanto"],
      move_category: ["physical", "special"],
      move_target: ["single", "aoe"],
      pokemon_location: ["team", "bag", "market"],
      rarity_tier: ["comum", "incomum", "raro", "ultra", "legendary", "mythic"],
    },
  },
} as const

