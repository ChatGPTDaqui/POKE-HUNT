// Gerado por node scripts/gerar-golpes-tm.js. Fonte: PokeAPI.
import type { AbilityDataEntry } from "./types"
export const GOLPES_TM: Record<string, AbilityDataEntry> = {
  "frustration": {
    "id": "frustration",
    "name": "Frustration",
    "type": "NORMAL",
    "category": "physical",
    "power": 0,
    "accuracy": 100,
    "pp": 20,
    "target": "single"
  },
  "return": {
    "id": "return",
    "name": "Return",
    "type": "NORMAL",
    "category": "physical",
    "power": 0,
    "accuracy": 100,
    "pp": 20,
    "target": "single"
  },
  "facade": {
    "id": "facade",
    "name": "Facade",
    "type": "NORMAL",
    "category": "physical",
    "power": 70,
    "accuracy": 100,
    "pp": 20,
    "target": "single"
  },
  "overheat": {
    "id": "overheat",
    "name": "Overheat",
    "type": "FIRE",
    "category": "special",
    "power": 130,
    "accuracy": 90,
    "pp": 5,
    "target": "single",
    "statChanges": [
      {
        "stat": "atkEsp",
        "estagios": -2
      }
    ],
    "statChance": 100,
    "statTarget": "self"
  },
  "focus_blast": {
    "id": "focus_blast",
    "name": "Focus Blast",
    "type": "FIGHTING",
    "category": "special",
    "power": 120,
    "accuracy": 70,
    "pp": 5,
    "target": "single",
    "statChanges": [
      {
        "stat": "defEsp",
        "estagios": -1
      }
    ],
    "statChance": 10
  },
  "scald": {
    "id": "scald",
    "name": "Scald",
    "type": "WATER",
    "category": "special",
    "power": 80,
    "accuracy": 100,
    "pp": 15,
    "target": "single",
    "status": "burn",
    "statusChance": 30
  },
  "brutal_swing": {
    "id": "brutal_swing",
    "name": "Brutal Swing",
    "type": "DARK",
    "category": "physical",
    "power": 60,
    "accuracy": 100,
    "pp": 20,
    "target": "aoe"
  },
  "smart_strike": {
    "id": "smart_strike",
    "name": "Smart Strike",
    "type": "STEEL",
    "category": "physical",
    "power": 70,
    "accuracy": 100,
    "pp": 10,
    "target": "single"
  },
  "aurora_veil": {
    "id": "aurora_veil",
    "name": "Aurora Veil",
    "type": "ICE",
    "category": "status",
    "power": 0,
    "accuracy": 100,
    "pp": 20,
    "target": "single"
  },
  "volt_switch": {
    "id": "volt_switch",
    "name": "Volt Switch",
    "type": "ELECTRIC",
    "category": "special",
    "power": 70,
    "accuracy": 100,
    "pp": 20,
    "target": "single"
  },
  "grass_knot": {
    "id": "grass_knot",
    "name": "Grass Knot",
    "type": "GRASS",
    "category": "special",
    "power": 0,
    "accuracy": 100,
    "pp": 20,
    "target": "single"
  },
  "trick_room": {
    "id": "trick_room",
    "name": "Trick Room",
    "type": "PSYCHIC",
    "category": "status",
    "power": 0,
    "accuracy": 100,
    "pp": 5,
    "target": "single"
  },
  "surf": {
    "id": "surf",
    "name": "Surf",
    "type": "WATER",
    "category": "special",
    "power": 90,
    "accuracy": 100,
    "pp": 15,
    "target": "aoe"
  },
  "dazzling_gleam": {
    "id": "dazzling_gleam",
    "name": "Dazzling Gleam",
    "type": "FAIRY",
    "category": "special",
    "power": 80,
    "accuracy": 100,
    "pp": 10,
    "target": "aoe"
  },
  "confide": {
    "id": "confide",
    "name": "Confide",
    "type": "NORMAL",
    "category": "status",
    "power": 0,
    "accuracy": 100,
    "pp": 20,
    "target": "single",
    "statChanges": [
      {
        "stat": "atkEsp",
        "estagios": -1
      }
    ],
    "statChance": 100
  }
}
