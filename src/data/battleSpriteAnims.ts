// Battle sprite animation metadata, fetched from the PMD Sprite Collab
// repository (https://sprites.pmdcollab.org/) for the 32 species currently in
// the game. Frame PNGs live at assets/battle-sprites/<speciesId>/<Anim>-Anim.png
// (8 direction rows x N frame columns, standard PMD layout). durations are in
// game ticks (1 tick = 1/60s, matching our own fixed-step loop).
// Not every species has every animation — see ANIM_FALLBACKS in battleSprites.js.

// `Hurt` (PH-532): flinch de levar dano, 380/380 especies no acervo (ver
// docs/arquivo/2026-09-08/docs/18-animacoes-do-pmd-disponiveis.md) — importado
// por scripts/importar-hurt-anim.mjs, disparado em ONE-SHOT (nunca em loop) no
// replay do PvP quando um golpe tira >= 30% do HP maximo do defensor.
export type AnimName = 'Idle' | 'Walk' | 'Shoot' | 'Charge' | 'Sleep' | 'Faint' | 'Hurt'

export interface BattleSpriteAnimMeta {
  frameWidth: number
  frameHeight: number
  durations: number[]
}

export type BattleSpriteAnimSet = Partial<Record<AnimName, BattleSpriteAnimMeta>>

export const BATTLE_SPRITE_ANIMS: Record<string, BattleSpriteAnimSet> = {
  "charmander": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        12,
        8,
        8,
        8
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "squirtle": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        12,
        8,
        12,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        2,
        2,
        4,
        4,
        4,
        2,
        2
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "bulbasaur": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        12,
        4,
        4,
        4,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        6,
        6
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "geodude": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        9,
        8,
        20,
        9,
        8,
        20
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "spearow": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        3,
        3,
        3,
        3,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        2,
        3,
        4,
        3,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "rattata": {
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        6,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        40,
        2,
        2,
        2,
        4,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "pidgey": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        2,
        1
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        4,
        4,
        4,
        4
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 16,
      "durations": [
        35,
        30
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "sentret": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 72,
      "durations": [
        30,
        10,
        2,
        2,
        3,
        3,
        3,
        2
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "hoppip": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        60,
        10,
        8,
        10,
        8,
        6,
        4,
        2,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "zubat": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        10,
        6,
        6,
        6,
        6,
        6,
        6,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "dunsparce": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        36,
        19
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "caterpie": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        10,
        10,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        1,
        1,
        6
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        4,
        10,
        4
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "weedle": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        4,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        8,
        8,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "charmeleon": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        2,
        3,
        3,
        3,
        2
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "wartortle": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        8,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "ivysaur": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        12,
        4,
        4,
        4,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        40,
        12,
        12,
        12
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "graveler": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 72,
      "durations": [
        4,
        1,
        2,
        4,
        4,
        2,
        1,
        1,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "fearow": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        4,
        5,
        6,
        4,
        5,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        3,
        3,
        3,
        3,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        1
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 72,
      "durations": [
        40,
        20,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "raticate": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        6,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        4,
        2,
        2,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        6,
        3,
        4,
        3,
        6
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        35,
        30
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "pidgeotto": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        2,
        1
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        2,
        4,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "furret": {
    "Walk": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        6,
        4,
        4,
        4,
        4,
        4,
        4,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        12,
        4,
        12,
        4,
        12
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "skiploom": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        20,
        20
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "golbat": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        6,
        6,
        6,
        6
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "metapod": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        4,
        2,
        2,
        2,
        2,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        4,
        2,
        2,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        14,
        10,
        14
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "kakuna": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        4,
        4,
        4,
        10
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        1,
        1,
        4,
        1,
        1
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "charizard": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        4,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        15,
        15,
        15,
        15
      ]
    },
    "Faint": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "blastoise": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        14,
        8,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        4,
        2,
        6,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        32,
        12,
        4,
        4,
        4,
        4,
        4,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        8
      ]
    }
  },
  "venusaur": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        16,
        8,
        16
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        12,
        4,
        4,
        4,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        16,
        12,
        16
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "pidgeot": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        2,
        1
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        2,
        4,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "jumpluff": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "butterfree": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        1,
        1,
        1,
        1,
        1,
        2,
        2,
        3,
        6,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        35,
        30
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "beedrill": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        16,
        8,
        16,
        16,
        8,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "bellsprout": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        20,
        22
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "unown": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        5,
        5,
        6,
        6,
        6,
        5,
        5,
        6
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        20,
        8,
        20,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        4,
        35,
        4
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "growlithe": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        40,
        4,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "sandshrew": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        2,
        2,
        2
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "onix": {
    "Walk": {
      "frameWidth": 88,
      "frameHeight": 112,
      "durations": [
        10,
        14,
        10,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 96,
      "frameHeight": 112,
      "durations": [
        2,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 56,
      "frameHeight": 104,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 96,
      "frameHeight": 104,
      "durations": [
        16,
        16,
        16,
        16
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 80,
      "frameHeight": 88,
      "durations": [
        2,
        8
      ]
    }
  },
  "paras": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        1,
        2,
        2,
        2,
        2,
        2,
        1,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        24,
        6,
        6,
        6
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        8
      ]
    }
  },
  "ekans": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 64,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        16,
        16
      ]
    },
    "Faint": {
      "frameWidth": 56,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "slowpoke": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        40,
        8,
        8,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 16,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "snubbull": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        4,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        2,
        3,
        4,
        3,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "abra": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10,
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        24,
        8,
        8,
        24,
        8,
        8
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "jigglypuff": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        4,
        4,
        4,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        25,
        8,
        15,
        8,
        15
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        35,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "ditto": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        10,
        8,
        10,
        8,
        8
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        16,
        16
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 16,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "nidoran_f": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        6,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        24,
        6,
        6,
        6,
        6
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "nidoran_m": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        5,
        6,
        6,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        4,
        4,
        4,
        4
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "sunkern": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        4,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        3,
        2,
        1,
        1,
        1,
        1,
        1,
        2,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        26,
        18
      ]
    },
    "Faint": {
      "frameWidth": 48,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "yanma": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "machop": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        3,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        4,
        4,
        4
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "koffing": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        6,
        6,
        6,
        6,
        8,
        6,
        6,
        6,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        1,
        1,
        1,
        2,
        2,
        2,
        2,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        10,
        10,
        8,
        10,
        10,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "weezing": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        4,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        12,
        12,
        12,
        12,
        12,
        12,
        12,
        12,
        12,
        12,
        12
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "magnemite": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        6,
        6,
        8,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        4,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        10,
        14,
        10,
        14
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        20,
        8,
        8,
        20,
        8,
        8
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "tauros": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        3,
        6,
        3,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "miltank": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        4,
        4
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        8,
        3,
        5,
        3,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "arbok": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        6,
        6,
        8,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 72,
      "frameHeight": 72,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        32,
        14
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "farfetch_d": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        6,
        12,
        6,
        12
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        12,
        30,
        12
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "natu": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        4,
        8,
        4
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "smeargle": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 72,
      "frameHeight": 72,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        36,
        16
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "swinub": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        8,
        8,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        36,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "jynx": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        14,
        30,
        14
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "krabby": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        1,
        2,
        4,
        2,
        1
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        30
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 16,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "seel": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        6,
        8,
        10,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        20
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "tangela": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 72,
      "durations": [
        2,
        8,
        1,
        2,
        4,
        4
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        34,
        6,
        6,
        6
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "lickitung": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        14,
        10,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        36,
        12,
        10,
        12
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "weepinbell": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        16,
        8,
        16,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        12,
        10,
        12,
        12,
        10,
        12
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "ursaring": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "gligar": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        6,
        4,
        4,
        4,
        8,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 72,
      "durations": [
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "donphan": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        40,
        8,
        20,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "skarmory": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 72,
      "durations": [
        4,
        4,
        4,
        4,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        2,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        40,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "machoke": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        4,
        4,
        4
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "larvitar": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        30,
        1,
        2,
        4,
        2,
        1,
        16,
        1,
        2,
        4,
        2,
        1
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "pupitar": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        4,
        12,
        6,
        4,
        4,
        36
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "magmar": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        6,
        12,
        6
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "parasect": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        1,
        2,
        2,
        2,
        2,
        2,
        1,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        40,
        4,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "ponyta": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "rapidash": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "doduo": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        6,
        12,
        6
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "dodrio": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        40,
        10,
        16,
        10,
        16,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "sandslash": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        25,
        10,
        25,
        10
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "slowbro": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        8,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        30,
        30
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "granbull": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        2,
        2,
        2,
        4,
        2,
        4,
        2,
        4,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        30
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "kadabra": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        3,
        4,
        4,
        3,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        6,
        6,
        6,
        6,
        6,
        6,
        4
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "nidorina": {
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        2,
        4,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "nidorino": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        6,
        12,
        6,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        6
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "magneton": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        4,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        14,
        10,
        14,
        10
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "xatu": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        3,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        30
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "piloswine": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        4,
        1,
        1,
        1,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        40,
        8,
        8,
        8,
        8
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "kingler": {
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        1,
        2,
        4,
        2,
        1
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        30
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "dewgong": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        6,
        6,
        6,
        10,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        30,
        12,
        8,
        12,
        8,
        12
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "tyranitar": {
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        10,
        16,
        10,
        16
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        3,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        14,
        24,
        14,
        24
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "pichu": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        32,
        4,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "cleffa": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        36,
        18
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        6,
        6,
        6,
        8,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "igglybuff": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        16,
        16
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        4,
        4,
        4,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "togepi": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        8,
        10,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        6,
        8,
        8,
        6,
        8
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "pikachu": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        40,
        2,
        3,
        3,
        3,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        1,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "hoothoot": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        48,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        6,
        6,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "spinarak": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        40,
        2,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        10,
        10,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "ledyba": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        1,
        2,
        4,
        2,
        1,
        6,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "pineco": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        26,
        22
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "oddish": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        4,
        8,
        6,
        8,
        4,
        8,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "poliwag": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        30,
        8,
        6,
        6,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        8
      ]
    }
  },
  "diglett": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        16,
        16
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        8
      ]
    }
  },
  "voltorb": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        22,
        6,
        2,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        6,
        10,
        4,
        4,
        4,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "meowth": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        12,
        12,
        12,
        12
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        1,
        2,
        3,
        3,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "gastly": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        3,
        3,
        3,
        3,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        6,
        6,
        6,
        16,
        6,
        6,
        6,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "drowzee": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        10,
        6,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        35,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "magikarp": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        10,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        2,
        4,
        6,
        4,
        2,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        4,
        1,
        2,
        2,
        1,
        3,
        3,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "goldeen": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        16,
        10,
        16,
        10,
        16,
        10,
        16,
        2,
        4,
        4,
        4,
        12,
        10,
        16,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "horsea": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        16,
        8,
        16
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "tentacool": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        4,
        8,
        8,
        4,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        8,
        1,
        2,
        6,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "exeggcute": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        2,
        4,
        4,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        1,
        1,
        2,
        6,
        1,
        2,
        6,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "mareep": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        4,
        3,
        3,
        3,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "cyndaquil": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        40,
        16
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        3,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "chikorita": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        40,
        2,
        4,
        3,
        1,
        1
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        5,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "totodile": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        4,
        2,
        6,
        3,
        2,
        3
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        3,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "mankey": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        4,
        4,
        4,
        8,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "cubone": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        1,
        2,
        3,
        2,
        1
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "chinchou": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        14,
        10,
        12,
        12,
        14
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        4,
        6,
        8,
        8,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        16,
        8,
        8,
        16,
        8,
        8,
        8
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "shellder": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        14,
        40,
        14,
        30
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        10,
        6,
        10,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        5,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        24,
        10,
        10,
        24,
        10,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "staryu": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        36,
        10,
        6,
        10
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        8,
        1,
        1,
        1,
        4,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "grimer": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        40,
        8,
        30,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "venonat": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        16,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        6,
        6,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8,
        1,
        2,
        4,
        4
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "psyduck": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        16,
        20,
        16,
        20
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        4,
        5,
        1,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        35,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "wooper": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        24,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        6,
        6,
        6,
        8,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        8
      ]
    }
  },
  "slugma": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        6,
        34,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        14,
        8,
        16,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        8
      ]
    }
  },
  "houndour": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        6,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "teddiursa": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        40,
        12,
        8,
        12,
        8,
        20
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "phanpy": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        8,
        20,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        3,
        5,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "remoraid": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        10,
        10,
        8,
        8,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "tyrogue": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        30,
        1,
        2,
        4,
        4,
        2,
        1
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        4,
        8,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "elekid": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        30,
        4,
        6,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "magby": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        30,
        2,
        3,
        4,
        3,
        2
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "smoochum": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        6,
        6,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "marill": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        26,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        8,
        10,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "sudowoodo": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 16,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "murkrow": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        46,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        8,
        4,
        4,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "aipom": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        18
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        4,
        6,
        4,
        8,
        4,
        6,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "qwilfish": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        12,
        10,
        10,
        10,
        12,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "corsola": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        52,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "sneasel": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        1,
        2,
        4,
        2,
        2,
        1
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "girafarig": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        12,
        4,
        4,
        4,
        4,
        4,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "stantler": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        4,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 80,
      "durations": [
        2,
        8
      ]
    }
  },
  "misdreavus": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        3,
        3,
        3,
        5,
        1,
        1,
        1,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "delibird": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        12,
        12,
        12,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        4,
        8,
        2,
        1,
        1,
        2,
        1,
        1,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "sunflora": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        1,
        2,
        3,
        4,
        3,
        2,
        1,
        4,
        1,
        2,
        3,
        4,
        3,
        2,
        1
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        14,
        8,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "wobbuffet": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "mantine": {
    "Idle": {
      "frameWidth": 64,
      "frameHeight": 72,
      "durations": [
        12,
        12,
        12,
        12,
        12,
        12,
        12,
        12
      ]
    },
    "Walk": {
      "frameWidth": 64,
      "frameHeight": 72,
      "durations": [
        6,
        6,
        8,
        8,
        6,
        6,
        6,
        8,
        8,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 72,
      "frameHeight": 80,
      "durations": [
        2,
        2,
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 64,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 80,
      "frameHeight": 96,
      "durations": [
        2,
        8
      ]
    }
  },
  "rhyhorn": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        40,
        20,
        15
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "hitmonlee": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        40,
        20
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        10,
        12,
        10,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "hitmonchan": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        30,
        6,
        8,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "kangaskhan": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        30,
        3,
        4,
        3,
        20
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        16,
        10,
        16,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        1,
        1,
        1,
        1,
        1,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "lapras": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        40,
        12,
        16,
        12
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        10,
        12,
        10,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 72,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 96,
      "durations": [
        2,
        8
      ]
    }
  },
  "porygon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        12,
        8,
        12,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        10,
        10,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        16,
        8,
        16,
        16,
        8,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "eevee": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        16,
        16
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        4,
        4,
        6,
        2,
        2
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        4,
        6,
        4,
        2,
        4,
        4,
        4,
        4
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "scyther": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        10,
        14,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "pinsir": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        2,
        6,
        3,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "dratini": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        20,
        10,
        20
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "omanyte": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        1,
        2,
        2,
        2,
        2,
        1,
        6,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "kabuto": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        40,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        4,
        4,
        4,
        2,
        2,
        2,
        4,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 16,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        8
      ]
    }
  },
  "aerodactyl": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "snorlax": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        40,
        1,
        3,
        4,
        3,
        1
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "heracross": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        30,
        8,
        4,
        8,
        4,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "alakazam": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        4,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "gengar": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        4,
        3,
        3,
        3,
        3,
        3,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        4,
        1,
        1,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "machamp": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        40,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "victreebel": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        35,
        3,
        3,
        5,
        5,
        5,
        3,
        3,
        3
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "arcanine": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "nidoking": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        35,
        12
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        14,
        8,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "nidoqueen": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        20,
        6,
        6,
        6,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "steelix": {
    "Idle": {
      "frameWidth": 64,
      "frameHeight": 112,
      "durations": [
        18,
        8,
        18,
        8
      ]
    },
    "Walk": {
      "frameWidth": 72,
      "frameHeight": 112,
      "durations": [
        10,
        14,
        10,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 96,
      "frameHeight": 120,
      "durations": [
        2,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 64,
      "frameHeight": 112,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 112,
      "durations": [
        2,
        8
      ]
    }
  },
  "gyarados": {
    "Idle": {
      "frameWidth": 72,
      "frameHeight": 128,
      "durations": [
        18,
        8,
        18,
        8
      ]
    },
    "Walk": {
      "frameWidth": 88,
      "frameHeight": 128,
      "durations": [
        10,
        14,
        10,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 104,
      "frameHeight": 128,
      "durations": [
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 96,
      "frameHeight": 112,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 72,
      "frameHeight": 112,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 72,
      "frameHeight": 120,
      "durations": [
        2,
        8
      ]
    }
  },
  "articuno": {
    "Idle": {
      "frameWidth": 88,
      "frameHeight": 88,
      "durations": [
        8,
        10,
        8,
        16
      ]
    },
    "Walk": {
      "frameWidth": 88,
      "frameHeight": 88,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 104,
      "frameHeight": 104,
      "durations": [
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 72,
      "frameHeight": 96,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 120,
      "durations": [
        2,
        8
      ]
    }
  },
  "zapdos": {
    "Idle": {
      "frameWidth": 56,
      "frameHeight": 96,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Walk": {
      "frameWidth": 56,
      "frameHeight": 96,
      "durations": [
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 72,
      "frameHeight": 112,
      "durations": [
        2,
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 56,
      "frameHeight": 96,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 80,
      "frameHeight": 104,
      "durations": [
        2,
        8
      ]
    }
  },
  "moltres": {
    "Idle": {
      "frameWidth": 80,
      "frameHeight": 96,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Walk": {
      "frameWidth": 80,
      "frameHeight": 96,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 96,
      "frameHeight": 96,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 96,
      "frameHeight": 104,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 80,
      "frameHeight": 120,
      "durations": [
        2,
        8
      ]
    }
  },
  "raikou": {
    "Idle": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "entei": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        10,
        12,
        10,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "suicune": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        10,
        12,
        10,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "lugia": {
    "Idle": {
      "frameWidth": 72,
      "frameHeight": 96,
      "durations": [
        30,
        30
      ]
    },
    "Walk": {
      "frameWidth": 80,
      "frameHeight": 96,
      "durations": [
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 88,
      "frameHeight": 128,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 72,
      "frameHeight": 96,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 56,
      "frameHeight": 80,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 88,
      "frameHeight": 112,
      "durations": [
        2,
        8
      ]
    }
  },
  "ho_oh": {
    "Idle": {
      "frameWidth": 72,
      "frameHeight": 112,
      "durations": [
        12,
        10,
        12,
        10,
        12
      ]
    },
    "Walk": {
      "frameWidth": 72,
      "frameHeight": 112,
      "durations": [
        8,
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 80,
      "frameHeight": 120,
      "durations": [
        4,
        2,
        4,
        2,
        1,
        1,
        1,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 72,
      "frameHeight": 112,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 96,
      "frameHeight": 128,
      "durations": [
        2,
        8
      ]
    }
  },
  "celebi": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        8,
        7,
        6,
        6,
        6,
        7
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "mewtwo": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        40,
        2,
        4,
        6,
        8,
        6,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        12,
        6,
        6,
        12,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "mew": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        12,
        8,
        12,
        8
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        3,
        3,
        3,
        3,
        3,
        3,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "noctowl": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        40,
        2,
        2,
        6,
        1,
        2,
        3,
        6,
        3,
        2,
        2,
        2,
        3,
        3,
        2,
        2
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "ariados": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        12,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "ledian": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        1,
        2,
        4,
        2,
        1,
        6,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "forretress": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        8,
        20,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        4,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "gloom": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "poliwhirl": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        2,
        4,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        1,
        1,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "dugtrio": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        12,
        16
      ]
    },
    "Walk": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        8
      ]
    }
  },
  "electrode": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        10,
        18,
        10,
        18
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        4,
        4,
        6,
        8,
        6,
        4,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "persian": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 16,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "haunter": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        14,
        8,
        14,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        6,
        6,
        6,
        10,
        6,
        6,
        6,
        6,
        10,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        8,
        20,
        8,
        8,
        20
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "hypno": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        30,
        1,
        2,
        3,
        3,
        3,
        2,
        1
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        35,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "seaking": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        16,
        10,
        16,
        10,
        16,
        10,
        16,
        2,
        4,
        4,
        4,
        12,
        10,
        16,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        10,
        8,
        10,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "seadra": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        12,
        12,
        12,
        12,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "tentacruel": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        10,
        10,
        6,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "flaaffy": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        4,
        3,
        3,
        3,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "quilava": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        8,
        4,
        8,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        3,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 16,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "bayleef": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        40,
        14,
        20,
        14
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "croconaw": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        25
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        12,
        10,
        12,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "primeape": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        22,
        4,
        6,
        4,
        22,
        4,
        6,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "marowak": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        6,
        16,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        3,
        4
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "lanturn": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        20,
        6,
        6,
        6,
        8,
        8,
        20,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        20,
        14,
        14,
        20,
        14,
        14
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        8,
        12,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "muk": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        8,
        30,
        8
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        10,
        8,
        6,
        10,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "venomoth": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        12,
        12,
        12,
        12,
        12,
        12,
        12,
        12
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        30,
        8,
        8,
        30,
        8,
        8
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "golduck": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        20,
        40,
        20
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        35,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "quagsire": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        36,
        4,
        6,
        8,
        6,
        4,
        36
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        10,
        12,
        10,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "magcargo": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        12
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "houndoom": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        6,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "octillery": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        24,
        20
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        10,
        12,
        8,
        16,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        2,
        3,
        8,
        1,
        1,
        1,
        8,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "electabuzz": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        28,
        18,
        28,
        18
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        3,
        3,
        3,
        3,
        3,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "azumarill": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        6,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "rhydon": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        40,
        26
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        6,
        2,
        2,
        3,
        3,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "dragonair": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        8,
        6,
        6,
        8,
        6,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        8,
        6,
        6,
        8,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 80,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "omastar": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        20
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "kabutops": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        20,
        10,
        20,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        6,
        4,
        8,
        4,
        6,
        4,
        8,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "ampharos": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        8,
        8,
        4,
        6,
        4,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "typhlosion": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        30,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        3,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "meganium": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        14,
        20,
        14
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        10,
        14,
        10,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "feraligatr": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        36,
        2,
        4,
        2,
        2,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "dragonite": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        40,
        2,
        2,
        3,
        3,
        2,
        2
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "kingdra": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 72,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 64,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "politoed": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        40,
        3,
        5,
        3,
        6
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 72,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        1,
        1,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "golem": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        25
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "porygon2": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        12,
        8,
        12,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        10,
        10,
        10,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "scizor": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        30,
        2,
        3,
        3,
        3,
        2
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "vileplume": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        3,
        3,
        8,
        3,
        3,
        30,
        3,
        3,
        8,
        3,
        3
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        35,
        30
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "bellossom": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        8,
        4,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "exeggutor": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        40,
        12,
        8,
        12
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "poliwrath": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        2,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        1,
        1,
        2,
        2,
        2,
        1,
        1,
        6,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "slowking": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        20,
        8,
        12,
        12,
        8,
        20,
        8,
        12,
        12,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        10,
        12,
        10,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "cloyster": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        12,
        12,
        12,
        14,
        12,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        10,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        22,
        15,
        10,
        22,
        15,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "starmie": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        60,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "wigglytuff": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        4,
        6,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        35,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "vaporeon": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        60,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "jolteon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        60,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "flareon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        12,
        16,
        12,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        4,
        6,
        2,
        2,
        3,
        3,
        3,
        3
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "espeon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        6,
        4,
        2,
        1,
        1,
        1,
        1,
        1,
        1,
        4
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "umbreon": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        2,
        6,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "raichu": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        40,
        2,
        4,
        4,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        1,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "crobat": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        12,
        12,
        12,
        12,
        12,
        12,
        12,
        12
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        8,
        1,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "hitmontop": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        30,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        4,
        1,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "clefairy": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        3,
        4,
        5,
        4,
        3
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        4,
        8,
        4,
        8,
        4,
        8,
        4
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "togetic": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        30,
        4,
        3,
        3,
        3,
        4
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "clefable": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        6,
        6,
        6,
        8,
        6,
        6,
        6
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "treecko": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "grovyle": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        18,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        6,
        6,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "sceptile": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        30
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        10,
        8,
        10,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        4,
        1,
        1,
        1,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "torchic": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        3,
        4,
        3,
        3
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        4,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "combusken": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        40,
        4,
        6,
        6,
        4
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "blaziken": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        30,
        30
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 72,
      "durations": [
        2,
        2,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "mudkip": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        38,
        2,
        2,
        5,
        3,
        3,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        4,
        6,
        4,
        6,
        6,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        3,
        4,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "marshtomp": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        36,
        16,
        36,
        16
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 16,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "swampert": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        40,
        1,
        2,
        4,
        2,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "poochyena": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        8,
        5,
        8,
        5,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "mightyena": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        40,
        8,
        5,
        8,
        5,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        10,
        10,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        6,
        2,
        2,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "zigzagoon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        2,
        4,
        4,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        6,
        4,
        4,
        2,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "linoone": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "wurmple": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        12,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        2,
        4,
        6,
        4,
        2
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        3,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "silcoon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        120
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        120
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "beautifly": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        10,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "cascoon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        120
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        120
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "dustox": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        6,
        4,
        4,
        6,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "lotad": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        24,
        18,
        24,
        18
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        6,
        1,
        2,
        3,
        3,
        3,
        3,
        3,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 16,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "lombre": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        1,
        2,
        3,
        4,
        2,
        1,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "ludicolo": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        20
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "seedot": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        36,
        18
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        4,
        6,
        4,
        8,
        4,
        6,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "nuzleaf": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        6,
        2,
        3,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "shiftry": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        24,
        4,
        4,
        4,
        24,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        4,
        4,
        4,
        8,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        1,
        2,
        4,
        2,
        1,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "taillow": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        4,
        6,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        3,
        3,
        3,
        3,
        3,
        3,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 16,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "swellow": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        40,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        3,
        3,
        3,
        3,
        3,
        3,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "wingull": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        8,
        6,
        8,
        6,
        8,
        6,
        8,
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "pelipper": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        4,
        8,
        10,
        4,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "ralts": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        40,
        25
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        10,
        8,
        10,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "kirlia": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        60,
        4,
        4,
        4,
        4,
        4,
        4,
        6,
        24
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        1,
        2,
        3,
        3,
        1,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "gardevoir": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        12,
        6,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "surskit": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        16,
        8,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "masquerain": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "shroomish": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        40,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "breloom": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        4,
        4,
        4,
        4,
        4,
        8,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "slakoth": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        60,
        8
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        4,
        4,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "vigoroth": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        2,
        2,
        6,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "slaking": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        50,
        6,
        2,
        6,
        4,
        2,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        10,
        16,
        10,
        16
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "nincada": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        40,
        4,
        2,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "ninjask": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        9
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "shedinja": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        8,
        4,
        4,
        4,
        4,
        8,
        8,
        4,
        4,
        4,
        4,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        12,
        12,
        16,
        12,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 80,
      "durations": [
        2,
        8
      ]
    }
  },
  "whismur": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        1,
        1,
        4,
        2,
        1
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        1,
        1,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        1,
        1,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "loudred": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        1,
        1,
        4,
        4,
        2,
        1
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        6,
        10,
        6,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        3,
        3,
        3,
        3,
        3,
        3,
        1,
        1,
        4,
        3,
        2,
        1
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "exploud": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        10,
        8,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        1,
        2,
        2,
        4,
        1,
        2,
        2,
        4,
        1,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "makuhita": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        20,
        4,
        4,
        4,
        2,
        2,
        2,
        2,
        20,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "hariyama": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        26,
        2,
        4,
        4,
        2,
        1,
        26,
        1,
        4,
        4,
        2,
        1
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "azurill": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        16,
        10,
        16,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "nosepass": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        30,
        6,
        4,
        4,
        4,
        4,
        4,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "skitty": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        8,
        6,
        8
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        5,
        6,
        6,
        6,
        5,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "delcatty": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        5,
        5,
        5,
        5,
        5,
        5,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        6,
        2,
        2,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "sableye": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        12
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "mawile": {
    "Idle": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        40,
        2,
        2,
        2,
        4,
        6,
        4,
        6,
        4,
        2,
        2,
        2,
        4
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 72,
      "frameHeight": 64,
      "durations": [
        1,
        1,
        1,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        4,
        2,
        2,
        1,
        1
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "aron": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        34,
        12,
        8,
        12
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        6,
        8,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "lairon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        16,
        8,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "aggron": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        40,
        6,
        2,
        6,
        2,
        6
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "meditite": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        16,
        8,
        16
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        1,
        2,
        4,
        2,
        2,
        2,
        4,
        1,
        1,
        2,
        4,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "medicham": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        40,
        2,
        2,
        3,
        4,
        3,
        2,
        2
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        10,
        6,
        6,
        6,
        10,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 80,
      "durations": [
        2,
        8
      ]
    }
  },
  "electrike": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "manectric": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "plusle": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        10,
        6,
        10
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        6,
        4,
        8,
        4,
        6,
        4,
        8,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        4,
        1,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        4,
        2,
        1,
        1
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "minun": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        10,
        6,
        10
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        6,
        4,
        8,
        4,
        6,
        4,
        8,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        4,
        1,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        4,
        2,
        1,
        1
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "volbeat": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        8,
        4,
        8,
        4,
        8,
        4,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "illumise": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        20
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "roselia": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        40
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        8,
        1,
        1,
        4,
        3,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "gulpin": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        20,
        30
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        8,
        10,
        8,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        5,
        3,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "swalot": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        16,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        8,
        10,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        5,
        3,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "carvanha": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        26,
        8,
        36
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 80,
      "durations": [
        2,
        8
      ]
    }
  },
  "sharpedo": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        16,
        16,
        16,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        10,
        8,
        8,
        8,
        10,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        26,
        8,
        8,
        26
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "wailmer": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        16,
        10,
        16,
        16,
        10,
        10,
        16
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        6,
        6,
        8,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "wailord": {
    "Idle": {
      "frameWidth": 72,
      "frameHeight": 104,
      "durations": [
        24,
        12,
        12,
        24,
        12,
        12
      ]
    },
    "Walk": {
      "frameWidth": 72,
      "frameHeight": 104,
      "durations": [
        10,
        8,
        6,
        6,
        8,
        8,
        10,
        8,
        6,
        6,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 80,
      "frameHeight": 112,
      "durations": [
        2,
        3,
        4,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 72,
      "frameHeight": 104,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 72,
      "frameHeight": 80,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 80,
      "frameHeight": 128,
      "durations": [
        2,
        8
      ]
    }
  },
  "numel": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        8,
        12,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "camerupt": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        20,
        8,
        20
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "torkoal": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        40,
        20,
        20,
        20
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 80,
      "frameHeight": 72,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "spoink": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        30,
        4,
        4,
        8,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        4,
        6,
        4,
        6,
        4,
        4,
        4,
        6,
        4,
        6,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        40,
        30
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "grumpig": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        12,
        8,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "spinda": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        4,
        8,
        14,
        4,
        5,
        6,
        8,
        14,
        6
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        10,
        10,
        12,
        14,
        12,
        10,
        10,
        12,
        14,
        12,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "trapinch": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        40,
        8,
        10,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 56,
      "durations": [
        1,
        2,
        1,
        2,
        1,
        2,
        1,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 24,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "vibrava": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        40,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        4,
        6,
        6,
        6,
        4,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "flygon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 72,
      "durations": [
        8,
        9,
        8,
        8,
        11,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "cacnea": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        40,
        10,
        16,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "cacturne": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        40,
        2,
        4,
        4,
        4,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "swablu": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        4,
        4,
        4,
        4,
        6,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        6,
        6,
        8,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "altaria": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        60,
        6,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "zangoose": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        30,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        1,
        2,
        4,
        2,
        1,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "seviper": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        14,
        18,
        14,
        18
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "lunatone": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        4,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "solrock": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        5,
        1,
        1,
        1,
        4,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "barboach": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        12,
        10,
        10,
        12,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        6,
        6,
        8,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "whiscash": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        6,
        6,
        6,
        8,
        8,
        6,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        20,
        12,
        12,
        20,
        12,
        12
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "corphish": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        24,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "crawdaunt": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        24,
        12,
        24,
        12
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "baltoy": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        6,
        1,
        1,
        1,
        4,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        16,
        8,
        8,
        8,
        8,
        16,
        8,
        8
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "claydol": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 56,
      "durations": [
        2,
        4,
        6,
        1,
        1,
        1,
        4,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "lileep": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        8,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        4,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "cradily": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        40,
        4,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "anorith": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        10,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "armaldo": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "feebas": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        12,
        14,
        12,
        14
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10,
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "milotic": {
    "Idle": {
      "frameWidth": 72,
      "frameHeight": 80,
      "durations": [
        40,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 72,
      "frameHeight": 80,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 88,
      "frameHeight": 104,
      "durations": [
        2,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 64,
      "frameHeight": 72,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 88,
      "frameHeight": 104,
      "durations": [
        2,
        8
      ]
    }
  },
  "castform": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        6,
        6,
        6,
        6,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        35,
        30
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "kecleon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        40,
        2,
        6,
        2
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "shuppet": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        10,
        10,
        18,
        10,
        10,
        18
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "banette": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        40,
        1,
        2,
        4,
        4,
        4,
        4,
        2,
        1
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "duskull": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        24,
        8,
        8,
        24,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        16,
        8,
        8,
        8,
        16,
        8
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "dusclops": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        40,
        8,
        12,
        8
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        8,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        1,
        1,
        4,
        4,
        2,
        4,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "tropius": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        30,
        3,
        5,
        4,
        5,
        4,
        5,
        4,
        5,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        10,
        14,
        10,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "chimecho": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        18,
        8,
        18,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        4,
        4,
        6,
        6,
        4,
        4,
        4,
        4,
        6,
        6,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        28,
        10,
        10,
        28,
        10,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "absol": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        30,
        30
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "wynaut": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        2,
        10,
        2,
        8,
        2,
        10,
        2
      ]
    },
    "Shoot": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        1,
        1,
        6,
        2,
        1,
        4,
        1,
        1,
        6,
        2,
        1,
        4
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "snorunt": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        6,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "glalie": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "spheal": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        16,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "sealeo": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        14,
        18,
        14
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        6,
        6,
        8,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "walrein": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        40,
        2,
        8,
        8,
        8,
        8,
        8,
        4
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        8,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "clamperl": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        40,
        6,
        8,
        6
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        10,
        6,
        6,
        6,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        8,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  },
  "huntail": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 24,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 80,
      "durations": [
        2,
        8
      ]
    }
  },
  "gorebyss": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        16,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        14,
        6,
        8,
        8,
        8,
        8,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "relicanth": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        30,
        6,
        4,
        6,
        4,
        14,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        10,
        10,
        10,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "luvdisc": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        34,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "bagon": {
    "Idle": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        40,
        10,
        14,
        10
      ]
    },
    "Walk": {
      "frameWidth": 24,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "shelgon": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        18,
        20,
        18,
        20
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        8,
        10,
        8,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        4,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "salamence": {
    "Idle": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 56,
      "frameHeight": 80,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 80,
      "durations": [
        1,
        2,
        2,
        4,
        4,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 56,
      "frameHeight": 48,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 72,
      "frameHeight": 80,
      "durations": [
        2,
        8
      ]
    }
  },
  "beldum": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 32,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 32,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "metang": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        12,
        12,
        12,
        12,
        12,
        12,
        12,
        12
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 80,
      "durations": [
        2,
        8
      ]
    }
  },
  "metagross": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        20
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 40,
      "durations": [
        8,
        14,
        8,
        14
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 48,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 48,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 40,
      "durations": [
        2,
        8
      ]
    }
  },
  "regirock": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        40,
        1,
        4,
        2,
        3,
        4,
        3
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        18,
        8,
        18
      ]
    },
    "Shoot": {
      "frameWidth": 56,
      "frameHeight": 72,
      "durations": [
        8,
        1,
        1,
        1,
        8,
        6,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        2,
        8
      ]
    }
  },
  "regice": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 32,
      "frameHeight": 56,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        8,
        1,
        1,
        1,
        4,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "registeel": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        40,
        40
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        10,
        10,
        10,
        10
      ]
    },
    "Shoot": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        8,
        1,
        1,
        1,
        4,
        4,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 32,
      "frameHeight": 40,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 72,
      "durations": [
        2,
        8
      ]
    }
  },
  "latias": {
    "Idle": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 80,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 48,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 40,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Faint": {
      "frameWidth": 56,
      "frameHeight": 64,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 80,
      "durations": [
        2,
        8
      ]
    }
  },
  "latios": {
    "Idle": {
      "frameWidth": 64,
      "frameHeight": 80,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Walk": {
      "frameWidth": 64,
      "frameHeight": 80,
      "durations": [
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4,
        4
      ]
    },
    "Shoot": {
      "frameWidth": 72,
      "frameHeight": 88,
      "durations": [
        2,
        6,
        1,
        1,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 64,
      "frameHeight": 80,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 48,
      "frameHeight": 32,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 56,
      "frameHeight": 96,
      "durations": [
        2,
        8
      ]
    }
  },
  "kyogre": {
    "Idle": {
      "frameWidth": 64,
      "frameHeight": 72,
      "durations": [
        10,
        14,
        14,
        14,
        14,
        10,
        14,
        14,
        14,
        14
      ]
    },
    "Walk": {
      "frameWidth": 64,
      "frameHeight": 72,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 72,
      "frameHeight": 72,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 64,
      "frameHeight": 64,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 64,
      "frameHeight": 72,
      "durations": [
        16,
        12,
        16,
        16,
        12,
        16
      ]
    },
    "Hurt": {
      "frameWidth": 64,
      "frameHeight": 88,
      "durations": [
        2,
        8
      ]
    }
  },
  "groudon": {
    "Idle": {
      "frameWidth": 64,
      "frameHeight": 80,
      "durations": [
        60,
        10,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        10
      ]
    },
    "Walk": {
      "frameWidth": 64,
      "frameHeight": 88,
      "durations": [
        10,
        12,
        10,
        12
      ]
    },
    "Shoot": {
      "frameWidth": 80,
      "frameHeight": 88,
      "durations": [
        2,
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 64,
      "frameHeight": 80,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 56,
      "frameHeight": 56,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 72,
      "frameHeight": 80,
      "durations": [
        2,
        8
      ]
    }
  },
  "rayquaza": {
    "Idle": {
      "frameWidth": 80,
      "frameHeight": 120,
      "durations": [
        14,
        10,
        14,
        10
      ]
    },
    "Walk": {
      "frameWidth": 80,
      "frameHeight": 128,
      "durations": [
        8,
        8,
        6,
        4,
        4,
        4,
        8,
        8,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 112,
      "frameHeight": 120,
      "durations": [
        2,
        6,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 80,
      "frameHeight": 120,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 72,
      "frameHeight": 96,
      "durations": [
        10,
        10,
        10,
        30,
        10,
        10,
        10,
        30
      ]
    },
    "Hurt": {
      "frameWidth": 80,
      "frameHeight": 136,
      "durations": [
        2,
        8
      ]
    }
  },
  "jirachi": {
    "Idle": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        12,
        8,
        12,
        8
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 48,
      "durations": [
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        6
      ]
    },
    "Shoot": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        1,
        1,
        2,
        4,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Charge": {
      "frameWidth": 32,
      "frameHeight": 48,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 48,
      "durations": [
        8,
        8,
        8,
        24,
        8,
        8,
        8,
        24
      ]
    },
    "Faint": {
      "frameWidth": 40,
      "frameHeight": 40,
      "durations": [
        8,
        12,
        4,
        10
      ]
    },
    "Hurt": {
      "frameWidth": 48,
      "frameHeight": 64,
      "durations": [
        2,
        8
      ]
    }
  },
  "deoxys": {
    "Idle": {
      "frameWidth": 32,
      "frameHeight": 64,
      "durations": [
        12,
        12,
        12,
        12,
        12,
        12,
        12,
        12
      ]
    },
    "Walk": {
      "frameWidth": 40,
      "frameHeight": 64,
      "durations": [
        8,
        8,
        8,
        8,
        8,
        8,
        8,
        8
      ]
    },
    "Shoot": {
      "frameWidth": 64,
      "frameHeight": 88,
      "durations": [
        2,
        2,
        2,
        8,
        1,
        1,
        2,
        3,
        2,
        2,
        4,
        2
      ]
    },
    "Charge": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2,
        2
      ]
    },
    "Sleep": {
      "frameWidth": 24,
      "frameHeight": 56,
      "durations": [
        30,
        35
      ]
    },
    "Hurt": {
      "frameWidth": 40,
      "frameHeight": 56,
      "durations": [
        2,
        8
      ]
    }
  }
}
