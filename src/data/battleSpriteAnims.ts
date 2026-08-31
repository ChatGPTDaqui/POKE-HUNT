// Battle sprite animation metadata, fetched from the PMD Sprite Collab
// repository (https://sprites.pmdcollab.org/) for the 32 species currently in
// the game. Frame PNGs live at assets/battle-sprites/<speciesId>/<Anim>-Anim.png
// (8 direction rows x N frame columns, standard PMD layout). durations are in
// game ticks (1 tick = 1/60s, matching our own fixed-step loop).
// Not every species has every animation — see ANIM_FALLBACKS in battleSprites.js.

export type AnimName = 'Idle' | 'Walk' | 'Shoot' | 'Charge' | 'Sleep' | 'Faint'

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
    }
  }
}
