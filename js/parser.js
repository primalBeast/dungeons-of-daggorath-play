import {
  COMMANDS, DIRECTIONS, CLASS_ALIASES, TYPE_ALIASES,
} from './data.js';

const RING_WORDS = ['FIRE', 'ICE', 'ENERGY', 'FINAL'];

function buildLookup(table) {
  const map = new Map();
  for (const [full, abbr] of table) {
    map.set(full, full);
    map.set(abbr, full);
  }
  return map;
}

const CMD_MAP = buildLookup(COMMANDS);
const DIR_MAP = buildLookup(DIRECTIONS);
const VALID_CMDS = new Set(COMMANDS.map(([full]) => full));

const SHORT_CMD = {
  A: 'ATTACK', C: 'CLIMB', D: 'DROP', E: 'EXAMINE', G: 'GET',
  I: 'INCANT', L: 'LOOK', M: 'MOVE', P: 'PULL', R: 'REVEAL',
  S: 'STOW', T: 'TURN', U: 'USE',
};

const SHORT_DIR = {
  L: 'LEFT', R: 'RIGHT', B: 'BACK', A: 'AROUND', U: 'UP', D: 'DOWN',
};

function expandCommand(tok) {
  const u = tok.toUpperCase();
  if (u === 'ZS') return 'ZSAVE';
  if (u === 'ZL') return 'ZLOAD';
  if (u.length === 1 && SHORT_CMD[u]) return SHORT_CMD[u];
  if (CMD_MAP.has(u)) return CMD_MAP.get(u);
  if (VALID_CMDS.has(u)) return u;
  return u;
}

function expandArg(tok) {
  const u = tok.toUpperCase();
  if (RING_WORDS.includes(u)) return u;
  if (u.length === 1 && SHORT_DIR[u]) return SHORT_DIR[u];
  if (DIR_MAP.has(u)) return DIR_MAP.get(u);
  if (CLASS_ALIASES[u]) return CLASS_ALIASES[u];
  if (TYPE_ALIASES[u]) return TYPE_ALIASES[u];
  for (const [cls, ab] of Object.entries(CLASS_ALIASES)) {
    if (u === cls || u === ab) return cls;
  }
  for (const [typ, ab] of Object.entries(TYPE_ALIASES)) {
    if (u === typ || u === ab) return typ;
  }
  return u;
}

export function parseLine(line) {
  const raw = line.trim().toUpperCase();
  if (!raw) return { ok: false, error: '?' };
  const split = raw.split(/\s+/);
  const cmd = expandCommand(split[0]);
  if (!VALID_CMDS.has(cmd)) {
    return { ok: false, error: `UNKNOWN: ${split[0]}` };
  }
  const args = split.slice(1).map(expandArg);
  return { ok: true, cmd, args };
}

export function resolveHand(args) {
  const idx = args.findIndex((a) => a === 'LEFT' || a === 'RIGHT' || a === 'AROUND');
  if (idx < 0) return { hand: null, rest: args };
  const map = { LEFT: 'L', RIGHT: 'R', AROUND: 'A' };
  return { hand: map[args[idx]], rest: args.filter((_, i) => i !== idx) };
}

export function resolveDirection(args) {
  const dirs = ['LEFT', 'RIGHT', 'BACK', 'AROUND', 'UP', 'DOWN'];
  const hit = args.find((a) => dirs.includes(a));
  return hit ?? null;
}

function normalizeClass(cls) {
  if (!cls) return null;
  for (const [full, ab] of Object.entries(CLASS_ALIASES)) {
    if (cls === full || cls === ab) return full;
  }
  return cls;
}

function normalizeType(type) {
  if (!type) return null;
  for (const [full, ab] of Object.entries(TYPE_ALIASES)) {
    if (type === full || type === ab) return full;
  }
  return type;
}

export function resolveObject(args) {
  let cls = null;
  let type = null;
  for (const a of args) {
    if (Object.values(CLASS_ALIASES).includes(a) || Object.keys(CLASS_ALIASES).includes(a)) {
      cls = CLASS_ALIASES[a] ?? a;
    }
    if (TYPE_ALIASES[a] || Object.keys(TYPE_ALIASES).includes(a)) {
      type = TYPE_ALIASES[a] ?? a;
    }
  }
  return { cls: normalizeClass(cls), type: normalizeType(type) };
}

export function resolveRingWord(args) {
  return args.find((a) => RING_WORDS.includes(a)) ?? null;
}