import {
  GRID, OBJ, OBJ_DEFS, OBJ_WEIGHTS, OMXTAB,
} from './data.js';

const MAX_OBJECTS = 72;
const FLOOR = 0;
const PLAYER_OWN = 1;
const CREATURE_OWN = 2;

export class ObjectManager {
  constructor(rng) {
    this.rng = rng;
    this.pool = [];
    this.ptr = 0;
  }

  reset() {
    this.pool = [];
    this.ptr = 0;
    for (let i = 0; i < OMXTAB.length; i++) {
      const count = OMXTAB[i] & 0x0f;
      let level = OMXTAB[i] >> 4;
      for (let n = 0; n < count; n++) {
        this.birth(i, level);
        level++;
        if (level > 4) level = OMXTAB[i] >> 4;
      }
    }
  }

  birth(type, level) {
    const def = OBJ_DEFS[type];
    const obj = {
      id: this.ptr++,
      type,
      level,
      row: 0,
      col: 0,
      owner: 255,
      reveal: def?.rev ?? 0,
      charges: def?.charges ?? 0,
      timer: def?.timer ?? 0,
      next: -1,
      creature: -1,
    };
    this.pool.push(obj);
    return obj.id;
  }

  createHeld(type) {
    const id = this.birth(type, 0);
    const obj = this.pool[id];
    obj.owner = PLAYER_OWN;
    obj.reveal = 0;
    return id;
  }

  def(id) {
    return OBJ_DEFS[this.pool[id]?.type];
  }

  name(id, reveal = null) {
    if (id < 0) return 'EMPTY';
    const obj = this.pool[id];
    const rev = reveal ?? obj.reveal;
    if (rev > 0) return 'SOMETHING';
    return this.def(id)?.name ?? 'OBJECT';
  }

  shortName(id) {
    if (id < 0) return 'EMPTY';
    const cls = this.def(id)?.cls ?? '';
    const type = this.pool[id].type;
    const names = {
      [OBJ.PINE]: 'PINE', [OBJ.LUNAR]: 'LUNAR', [OBJ.SOLAR]: 'SOLAR',
      [OBJ.WOODEN]: 'WOODEN', [OBJ.IRON]: 'IRON', [OBJ.ELVISH]: 'ELVISH',
      [OBJ.LEATHER]: 'LEATHER', [OBJ.BRONZE]: 'BRONZE', [OBJ.MITHRIL]: 'MITHRIL',
      [OBJ.HALE]: 'HALE', [OBJ.ABYE]: 'ABYE', [OBJ.THEWS]: 'THEWS',
      [OBJ.VISION]: 'VISION', [OBJ.SEER]: 'SEER',
      [OBJ.VULCAN]: 'VULCAN', [OBJ.RIME]: 'RHIME', [OBJ.JOULE]: 'JOULE',
      [OBJ.SUPREME]: 'SUPREME', [OBJ.FIRE]: 'FIRE', [OBJ.ICE]: 'ICE',
      [OBJ.ENERGY]: 'ENERGY', [OBJ.FINAL]: 'FINAL', [OBJ.GOLD]: 'GOLD',
      [OBJ.EMPTY]: 'EMPTY', [OBJ.DEAD]: 'DEAD',
    };
    return `${names[type] ?? cls} ${cls}`;
  }

  weight(id) {
    if (id < 0) return 0;
    const cls = this.def(id)?.cls;
    return OBJ_WEIGHTS[cls] ?? 0;
  }

  forLevel(level) {
    return this.pool.filter((o) => o.level === level && o.owner === 255);
  }

  findAt(level, row, col) {
    return this.pool.find(
      (o) => o.level === level && o.row === row && o.col === col && o.owner === FLOOR,
    );
  }

  findIdAt(level, row, col) {
    const o = this.findAt(level, row, col);
    return o ? o.id : -1;
  }

  findAllOnFloor(level, row, col) {
    return this.pool.filter(
      (o) => o.level === level && o.row === row && o.col === col && o.owner === FLOOR,
    );
  }

  placeOnFloor(obj, level, row, col) {
    obj.level = level;
    obj.row = row;
    obj.col = col;
    obj.owner = FLOOR;
    obj.creature = -1;
  }

  giveToCreature(objId, creatureId, row, col, level) {
    const obj = this.pool[objId];
    obj.owner = CREATURE_OWN;
    obj.creature = creatureId;
    obj.row = row;
    obj.col = col;
    obj.level = level;
  }

  takeFromFloor(objId) {
    const obj = this.pool[objId];
    obj.owner = PLAYER_OWN;
    obj.row = 0;
    obj.col = 0;
  }

  drop(objId, row, col, level) {
    const obj = this.pool[objId];
    this.placeOnFloor(obj, level, row, col);
  }

  scatterOnLevel(level, dungeon) {
    const pending = this.forLevel(level);
    for (const obj of pending) {
      let row;
      let col;
      let tries = 0;
      do {
        row = this.rng.random() & 31;
        col = this.rng.random() & 31;
        tries++;
      } while (!dungeon.isPassable(row, col) && tries < 200);
      if (dungeon.isPassable(row, col)) {
        this.placeOnFloor(obj, level, row, col);
      }
    }
  }

  assignToCreatures(level, creatures, dungeon) {
    const pending = this.forLevel(level);
    for (const obj of pending) {
      const slot = creatures.takeObjectCarrier();
      if (slot >= 0) {
        const c = creatures.list[slot];
        creatures.attachObject(slot, obj.id);
        this.giveToCreature(obj.id, slot, c.row, c.col, level);
      } else {
        let row;
        let col;
        let tries = 0;
        do {
          row = this.rng.random() & 31;
          col = this.rng.random() & 31;
          tries++;
        } while (!dungeon.isPassable(row, col) && tries < 200);
        if (dungeon.isPassable(row, col)) {
          this.placeOnFloor(obj, level, row, col);
        }
      }
    }
  }

  dropCreatureLoot(creature, creatures, level) {
    let objId = creature.objChain;
    while (objId >= 0) {
      const obj = this.pool[objId];
      const next = obj.next;
      this.placeOnFloor(obj, level, creature.row, creature.col);
      objId = next;
    }
    creature.objChain = -1;
  }

  typeMatches(id, typeName) {
    const short = this.shortName(id).toUpperCase();
    const t = typeName.toUpperCase();
    return short.includes(t) || short.startsWith(t);
  }

  matchHeld(handId, cls, typeName) {
    if (handId < 0) return false;
    const def = this.def(handId);
    if (!def) return false;
    if (cls && def.cls !== cls) return false;
    if (typeName && !this.typeMatches(handId, typeName)) return false;
    return true;
  }

  matchFloor(level, row, col, cls, typeName) {
    const obj = this.findAt(level, row, col);
    if (!obj) return -1;
    const def = OBJ_DEFS[obj.type];
    if (cls && def.cls !== cls) return -1;
    if (typeName && !this.typeMatches(obj.id, typeName)) return -1;
    return obj.id;
  }

  activateRing(objId, word) {
    const obj = this.pool[objId];
    const def = OBJ_DEFS[obj.type];
    if (!def?.ringWord || def.ringWord !== word) return false;
    if (obj.reveal > 0) return false;
    obj.type = def.activated;
    obj.charges = OBJ_DEFS[obj.type]?.charges ?? 3;
    return true;
  }

  useTorch(objId) {
    const obj = this.pool[objId];
    const def = OBJ_DEFS[obj.type];
    if (!def || def.cls !== 'TORCH') return null;
    if (obj.timer <= 0) {
      obj.type = OBJ.DEAD;
      return { rLight: 0, mLight: 0, dead: true };
    }
    return { rLight: def.rLight, mLight: def.mLight, dead: false };
  }

  tickTorch(objId) {
    const obj = this.pool[objId];
    const def = OBJ_DEFS[obj.type];
    if (!def || def.cls !== 'TORCH' || obj.timer <= 0) return;
    obj.timer--;
    if (obj.timer <= 0) obj.type = OBJ.DEAD;
  }

  serialize() {
    return this.pool.map((o) => ({ ...o }));
  }

  deserialize(data) {
    this.pool = data.map((o) => ({ ...o }));
    this.ptr = this.pool.length;
  }
}