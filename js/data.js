export const GRID = 32;
export const LEVELS = 5;
export const CTYPES = 12;

export const CREATURE_NAMES = [
  'SPIDER', 'VIPER', 'GIANT', 'BLOB', 'KNIGHT', 'GIANT',
  'SCORPION', 'KNIGHT', 'WRAITH', 'GALDROG', 'WIZARD', 'WIZARD',
];

export const CREATURE_MAP_COLORS = [
  '#c8a0ff', '#ff9a5c', '#ff6b8a', '#7ec8ff', '#ffe066',
  '#b8e986', '#ff7eb9', '#80ffd4', '#d4a5ff', '#ffa07a',
  '#ff4444', '#cc66ff',
];

/** In-viewport sprite scale per creature type (1 = default wireframe size). */
export const CREATURE_SPRITE_SCALE = [
  0.9, 0.9, // SPIDER, VIPER
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
];

/** Composite threat score for bestiary ordering (weakest → strongest). */
export function creatureThreatScore(type) {
  const db = CREATURE_DB[type];
  if (!db) return 0;
  const magAtk = (160 * db.mgo * 128) >> 14;
  const physAtk = (160 * db.pho * 128) >> 14;
  const offense = magAtk + physAtk;
  const defense = (255 - db.mgd) + (255 - db.phd);
  const pace = 24000 / Math.max(1, db.move + db.atk);
  return db.hp * 2 + offense * 4 + defense + pace;
}

export function creatureDisplayName(type) {
  const base = CREATURE_NAMES[type] ?? `TYPE ${type}`;
  const peers = CREATURE_NAMES.map((n, i) => i).filter((i) => CREATURE_NAMES[i] === base);
  if (peers.length <= 1) return base;
  const rank = peers.indexOf(type);
  if (type === CTYPES - 1 && base === 'WIZARD') return 'WIZARD (BOSS)';
  return rank === 0 ? `${base} I` : `${base} II`;
}

export function creaturesByThreat() {
  return Array.from({ length: CTYPES }, (_, i) => i)
    .sort((a, b) => {
      const hpDiff = CREATURE_DB[a].hp - CREATURE_DB[b].hp;
      if (hpDiff !== 0) return hpDiff;
      return creatureThreatScore(a) - creatureThreatScore(b);
    });
}

export const CREATURE_DB = [
  { hp: 32, mgo: 0, mgd: 255, pho: 128, phd: 255, move: 2300, atk: 1100, sound: 'squeak' },
  { hp: 56, mgo: 0, mgd: 255, pho: 80, phd: 128, move: 1500, atk: 700, sound: 'rattle' },
  { hp: 200, mgo: 0, mgd: 255, pho: 52, phd: 192, move: 2900, atk: 2300, sound: 'growl' },
  { hp: 304, mgo: 0, mgd: 255, pho: 96, phd: 167, move: 3100, atk: 3100, sound: 'beoop' },
  { hp: 504, mgo: 0, mgd: 128, pho: 96, phd: 60, move: 1300, atk: 700, sound: 'klank' },
  { hp: 704, mgo: 0, mgd: 128, pho: 128, phd: 48, move: 1700, atk: 1300, sound: 'grawl' },
  { hp: 400, mgo: 255, mgd: 128, pho: 255, phd: 128, move: 500, atk: 400, sound: 'hiss' },
  { hp: 800, mgo: 0, mgd: 64, pho: 255, phd: 8, move: 1300, atk: 700, sound: 'kklank' },
  { hp: 800, mgo: 192, mgd: 16, pho: 192, phd: 8, move: 300, atk: 300, sound: 'wraith' },
  { hp: 1000, mgo: 255, mgd: 5, pho: 255, phd: 3, move: 400, atk: 300, sound: 'snarl' },
  { hp: 1000, mgo: 255, mgd: 6, pho: 255, phd: 0, move: 1300, atk: 700, sound: 'wizard' },
  { hp: 8000, mgo: 255, mgd: 6, pho: 255, phd: 0, move: 1300, atk: 700, sound: 'wizard' },
];

// Per-level creature spawn pools (from original CMTTAB)
export const CMTTAB = [
  9, 9, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0,
  2, 4, 0, 6, 6, 6, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 4, 0, 6, 8, 4, 0, 0, 1, 0,
  0, 0, 0, 0, 0, 0, 8, 6, 6, 4, 0, 0,
  2, 2, 2, 2, 2, 2, 2, 4, 4, 8, 0, 1,
];

export function creaturesForLevel(level) {
  const types = [];
  const base = level * CTYPES;
  for (let t = 0; t < CTYPES; t++) {
    if (CMTTAB[base + t] > 0) types.push(t);
  }
  return types;
}

/** Creature types and spawn counts for a dungeon level (original CMTTAB). */
export function creatureRosterForLevel(level) {
  const base = level * CTYPES;
  const roster = [];
  for (let t = 0; t < CTYPES; t++) {
    const count = CMTTAB[base + t];
    if (count > 0) {
      roster.push({ type: t, name: creatureDisplayName(t), count });
    }
  }
  return roster;
}

export const LEVTAB = [0x73, 0xc7, 0x5d, 0x97, 0xf3, 0x13, 0x87];

// type, row, col triplets; -1 ends a level section (from original VFTTAB)
// Level 0: empty — down exits read from the next section (original VFIND behavior)
export const VFTTAB = [
  -1,
  1, 0, 23,
  0, 15, 4,
  0, 20, 17,
  1, 28, 30,
  -1,
  1, 2, 3,
  0, 3, 31,
  0, 19, 20,
  0, 31, 0,
  -1,
  -1,
  0, 0, 31,
  0, 5, 0,
  0, 22, 28,
  0, 31, 16,
  -1,
  -1,
];

// dir 0=N, 1=E, 2=S, 3=W — row/col deltas per original STPTAB
export const STPTAB = [-1, 0, 0, 1, 1, 0, 0, -1];
export const DIR_DX = [0, 1, 0, -1];
export const DIR_DY = [-1, 0, 1, 0];

export const HF = { PAS: 0, DOR: 1, SDR: 2, WAL: 3 };
export const N_WALL = 0x03;
export const E_WALL = 0x0c;
export const S_WALL = 0x30;
export const W_WALL = 0xc0;

export const VF = {
  HOLE_UP: 0,
  LADDER_UP: 1,
  HOLE_DOWN: 2,
  LADDER_DOWN: 3,
};

export const OBJ = {
  SUPREME: 0, JOULE: 1, ELVISH: 2, MITHRIL: 3, SEER: 4, THEWS: 5,
  RIME: 6, VISION: 7, ABYE: 8, HALE: 9, SOLAR: 10, BRONZE: 11,
  VULCAN: 12, IRON: 13, LUNAR: 14, PINE: 15, LEATHER: 16, WOODEN: 17,
  FINAL: 18, ENERGY: 19, ICE: 20, FIRE: 21, GOLD: 22, EMPTY: 23, DEAD: 24,
};

export const OBJ_DEFS = {
  [OBJ.SUPREME]: { cls: 'RING', name: 'SUPREME RING', rev: 255, mgo: 0, pho: 5, wgt: 1, ringWord: 'FINAL', activated: OBJ.FINAL },
  [OBJ.JOULE]: { cls: 'RING', name: 'JOULE RING', rev: 170, mgo: 0, pho: 5, wgt: 1, ringWord: 'ENERGY', activated: OBJ.ENERGY },
  [OBJ.ELVISH]: { cls: 'SWORD', name: 'ELVISH SWORD', rev: 150, mgo: 64, pho: 64, wgt: 25 },
  [OBJ.MITHRIL]: { cls: 'SHIELD', name: 'MITHRIL SHIELD', rev: 140, mgo: 13, pho: 26, wgt: 25, magDef: 64, physDef: 64 },
  [OBJ.SEER]: { cls: 'SCROLL', name: 'SEER SCROLL', rev: 130, mgo: 0, pho: 5, wgt: 10 },
  [OBJ.THEWS]: { cls: 'FLASK', name: 'THEWS FLASK', rev: 70, mgo: 0, pho: 5, wgt: 5 },
  [OBJ.RIME]: { cls: 'RING', name: 'RHIME RING', rev: 52, mgo: 0, pho: 5, wgt: 1, ringWord: 'ICE', activated: OBJ.ICE },
  [OBJ.VISION]: { cls: 'SCROLL', name: 'VISION SCROLL', rev: 50, mgo: 0, pho: 5, wgt: 10 },
  [OBJ.ABYE]: { cls: 'FLASK', name: 'ABYE FLASK', rev: 48, mgo: 0, pho: 5, wgt: 5 },
  [OBJ.HALE]: { cls: 'FLASK', name: 'HALE FLASK', rev: 40, mgo: 0, pho: 5, wgt: 5 },
  [OBJ.SOLAR]: { cls: 'TORCH', name: 'SOLAR TORCH', rev: 70, mgo: 0, pho: 5, wgt: 10, timer: 720, rLight: 13, mLight: 11 },
  [OBJ.BRONZE]: { cls: 'SHIELD', name: 'BRONZE SHIELD', rev: 25, mgo: 0, pho: 26, wgt: 25, magDef: 96, physDef: 128 },
  [OBJ.VULCAN]: { cls: 'RING', name: 'VULCAN RING', rev: 13, mgo: 0, pho: 5, wgt: 1, ringWord: 'FIRE', activated: OBJ.FIRE },
  [OBJ.IRON]: { cls: 'SWORD', name: 'IRON SWORD', rev: 13, mgo: 0, pho: 40, wgt: 25 },
  [OBJ.LUNAR]: { cls: 'TORCH', name: 'LUNAR TORCH', rev: 25, mgo: 0, pho: 5, wgt: 10, timer: 360, rLight: 10, mLight: 4 },
  [OBJ.PINE]: { cls: 'TORCH', name: 'PINE TORCH', rev: 5, mgo: 0, pho: 5, wgt: 10, timer: 180, rLight: 7, mLight: 0 },
  [OBJ.LEATHER]: { cls: 'SHIELD', name: 'LEATHER SHIELD', rev: 5, mgo: 0, pho: 10, wgt: 25, magDef: 108, physDef: 128 },
  [OBJ.WOODEN]: { cls: 'SWORD', name: 'WOODEN SWORD', rev: 5, mgo: 0, pho: 16, wgt: 25 },
  [OBJ.FINAL]: { cls: 'RING', name: 'RING OF ENDINGS', rev: 0, mgo: 0, pho: 0, wgt: 1 },
  [OBJ.ENERGY]: { cls: 'RING', name: 'ENERGY RING', rev: 0, mgo: 255, pho: 255, wgt: 1, charges: 3 },
  [OBJ.ICE]: { cls: 'RING', name: 'ICE RING', rev: 0, mgo: 255, pho: 255, wgt: 1, charges: 3 },
  [OBJ.FIRE]: { cls: 'RING', name: 'FIRE RING', rev: 0, mgo: 255, pho: 255, wgt: 1, charges: 3 },
  [OBJ.GOLD]: { cls: 'RING', name: 'GOLD RING', rev: 0, mgo: 0, pho: 5, wgt: 1 },
  [OBJ.EMPTY]: { cls: 'FLASK', name: 'EMPTY FLASK', rev: 0, mgo: 0, pho: 5, wgt: 5 },
  [OBJ.DEAD]: { cls: 'TORCH', name: 'DEAD TORCH', rev: 5, mgo: 0, pho: 5, wgt: 10, timer: 0, rLight: 0, mLight: 0 },
};

// level nibble | count nibble
export const OMXTAB = [
  0x41, 0x31, 0x31, 0x32, 0x23, 0x23, 0x11, 0x13, 0x16, 0x14, 0x14, 0x16,
  0x01, 0x04, 0x08, 0x08, 0x03, 0x04,
];

export const OBJ_WEIGHTS = { FLASK: 5, RING: 1, SCROLL: 10, SHIELD: 25, SWORD: 25, TORCH: 10 };

export const COMMANDS = [
  ['ATTACK', 'ATK'], ['CLIMB', 'CLM'], ['DROP', 'DRP'], ['EXAMINE', 'EXM'],
  ['GET', 'GET'], ['INCANT', 'INC'], ['LOOK', 'LOK'], ['MOVE', 'MOV'],
  ['PULL', 'PUL'], ['REVEAL', 'REV'], ['STOW', 'STW'], ['TURN', 'TRN'],
  ['USE', 'USE'], ['ZLOAD', 'ZLO'], ['ZSAVE', 'ZSA'], ['RESTART', 'RES'],
];

export const DIRECTIONS = [
  ['LEFT', 'LFT'], ['RIGHT', 'RGT'], ['BACK', 'BAK'], ['AROUND', 'ARO'],
  ['UP', 'UP'], ['DOWN', 'DN'],
];

export const CLASS_ALIASES = {
  TORCH: 'T', SWORD: 'SW', SHIELD: 'SH', FLASK: 'F', SCROLL: 'SC', RING: 'R',
};

export const TYPE_ALIASES = {
  PINE: 'P', LUNAR: 'LU', SOLAR: 'SO', WOODEN: 'W', IRON: 'IR', ELVISH: 'EL',
  LEATHER: 'LE', BRONZE: 'B', MITHRIL: 'M', HALE: 'H', ABYE: 'A', THEWS: 'TH',
  VISION: 'VI', SEER: 'SE', VULCAN: 'VU', RHIME: 'RH', JOULE: 'JO', SUPREME: 'SU',
  FIRE: 'FI', ICE: 'IC', ENERGY: 'EN', FINAL: 'FI', GOLD: 'G', EMPTY: 'EM', DEAD: 'DE',
};