import {
  CTYPES, CMTTAB, CREATURE_DB, CREATURE_NAMES, STPTAB, GRID,
} from './data.js';

const MAX_CREATURES = 32;

function pickTunnelCell(dungeon, occupied) {
  const spots = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!dungeon.isPassable(r, c)) continue;
      if (occupied(r, c)) continue;
      spots.push([r, c]);
    }
  }
  if (spots.length === 0) return null;
  return spots[dungeon.rng.random() % spots.length];
}

export class CreatureManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.frozen = 0;
    this.regenCounts = [];
  }

  reset() {
    this.list = Array.from({ length: MAX_CREATURES }, () => this.emptySlot());
    this.frozen = 0;
    this.regenCounts = [...CMTTAB];
  }

  emptySlot() {
    return {
      active: false,
      type: 0,
      row: 0,
      col: 0,
      hp: 0,
      damage: 0,
      mgo: 0,
      mgd: 255,
      pho: 0,
      phd: 255,
      moveMs: 2000,
      atkMs: 1000,
      moveAt: 0,
      atkAt: 0,
      facing: 0,
      objChain: -1,
      dying: false,
    };
  }

  cmxPtr(level) {
    return level * CTYPES;
  }

  spawnLevel(level, dungeon) {
    const base = this.cmxPtr(level);
    for (let type = CTYPES - 1; type >= 0; type--) {
      let count = CMTTAB[base + type];
      while (count-- > 0) {
        this.birth(type, dungeon);
      }
    }
    this.dedupeCells(dungeon);
  }

  birth(type, dungeon) {
    const slot = this.list.findIndex((c) => !c.active);
    if (slot < 0) return -1;

    const spot = pickTunnelCell(
      dungeon,
      (r, col) => this.cellOccupied(r, col) >= 0,
    );
    if (!spot) return -1;

    const db = CREATURE_DB[type];
    const c = this.list[slot];
    c.active = true;
    c.type = type;
    c.hp = db.hp;
    c.damage = 0;
    c.mgo = db.mgo;
    c.mgd = db.mgd;
    c.pho = db.pho;
    c.phd = db.phd;
    c.moveMs = db.move;
    c.atkMs = db.atk;
    const now = performance.now();
    const moveJitter = dungeon.rng.random() % Math.max(1, db.move >> 2);
    const atkJitter = dungeon.rng.random() % Math.max(1, db.atk >> 2);
    c.moveAt = now + db.move + moveJitter;
    c.atkAt = now + db.atk + atkJitter;
    c.facing = dungeon.rng.random() & 3;
    c.objChain = -1;
    c.dying = false;
    c.row = spot[0];
    c.col = spot[1];
    return slot;
  }

  cellOccupied(row, col, exceptIdx = -1) {
    return this.list.findIndex(
      (c, i) => i !== exceptIdx && c.active && c.row === row && c.col === col,
    );
  }

  atCell(row, col) {
    return this.cellOccupied(row, col);
  }

  dedupeCells(dungeon) {
    const seen = new Map();
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (!c.active) continue;
      const key = (c.row << 5) | c.col;
      if (!seen.has(key)) {
        seen.set(key, i);
        continue;
      }
      const spot = pickTunnelCell(
        dungeon,
        (r, col) => this.cellOccupied(r, col, i) >= 0,
      );
      if (spot) {
        c.row = spot[0];
        c.col = spot[1];
        const newKey = (c.row << 5) | c.col;
        if (!seen.has(newKey)) seen.set(newKey, i);
      } else {
        c.active = false;
      }
    }
  }

  inFront(player) {
    const nr = player.row + STPTAB[player.dir * 2];
    const nc = player.col + STPTAB[player.dir * 2 + 1];
    return this.atCell(nr, nc);
  }

  /** Creature sharing the player's cell (original: CFIND2 on PROW/PCOL only). */
  attackTarget(player) {
    return this.atCell(player.row, player.col);
  }

  name(type) {
    return CREATURE_NAMES[type] ?? 'THING';
  }

  takeObjectCarrier() {
    return this.list.findIndex(
      (c) => c.active && c.type !== 6 && c.type < 10 && c.objChain < 0,
    );
  }

  attachObject(slot, objId) {
    this.list[slot].objChain = objId;
  }

  kill(slot, game) {
    const c = this.list[slot];
    if (!c.active) return;
    game.objects.dropCreatureLoot(c, this, game.level);
    const base = this.cmxPtr(game.level);
    if (this.regenCounts[base + c.type] > 0) {
      this.regenCounts[base + c.type]--;
    }
    c.active = false;
    c.objChain = -1;
  }

  ensureInTunnel(idx, dungeon) {
    const c = this.list[idx];
    if (!c.active || dungeon.isPassable(c.row, c.col)) return;
    const spot = pickTunnelCell(
      dungeon,
      (r, col) => this.cellOccupied(r, col, idx) >= 0,
    );
    if (spot) {
      c.row = spot[0];
      c.col = spot[1];
    } else {
      c.active = false;
    }
  }

  update(now, game) {
    if (this.frozen > 0 || game.finale) return;
    this.dedupeCells(game.dungeon);
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (!c.active || c.dying) continue;
      this.ensureInTunnel(i, game.dungeon);

      if (c.row === game.player.row && c.col === game.player.col) {
        if (now >= c.atkAt) {
          game.creatureAttack(i);
          c.atkAt = now + c.atkMs;
        }
        continue;
      }

      if (now < c.moveAt) continue;
      this.stepMove(i, game);
      c.moveAt = now + c.moveMs;
    }
  }

  canSeePlayer(c, dungeon, player) {
    if (c.row === player.row) {
      const dir = c.col < player.col ? 1 : 3;
      let r = c.row;
      let col = c.col;
      while (r !== player.row || col !== player.col) {
        if (!dungeon.canMove(r, col, dir)) return false;
        const next = dungeon.step(r, col, dir);
        r = next.row;
        col = next.col;
      }
      return true;
    }
    if (c.col === player.col) {
      const dir = c.row < player.row ? 2 : 0;
      let r = c.row;
      let col = c.col;
      while (r !== player.row || col !== player.col) {
        if (!dungeon.canMove(r, col, dir)) return false;
        const next = dungeon.step(r, col, dir);
        r = next.row;
        col = next.col;
      }
      return true;
    }
    return false;
  }

  homingDir(c, player) {
    if (c.row === player.row) return c.col < player.col ? 1 : 3;
    if (c.col === player.col) return c.row < player.row ? 2 : 0;
    return -1;
  }

  stepMove(idx, game) {
    const c = this.list[idx];
    const { player, dungeon } = game;

    const floorObj = game.objects.findAt(game.level, c.row, c.col);
    if (
      floorObj &&
      c.type !== 6 &&
      c.type < 10 &&
      c.objChain < 0 &&
      !(c.row === player.row && c.col === player.col)
    ) {
      c.objChain = floorObj.id;
      game.objects.giveToCreature(floorObj.id, idx, c.row, c.col, game.level);
      return;
    }

    if (this.canSeePlayer(c, dungeon, player)) {
      const dir = this.homingDir(c, player);
      if (dir >= 0 && this.tryMove(idx, dir, game)) return;
    }

    const movtab = game.rng.random() & 128 ? [0, 3, 1] : [0, 1, 3];
    const start = (game.rng.random() & 3) === 0 ? 1 : 0;
    const base = c.facing ?? 0;
    for (let i = start; i < movtab.length; i++) {
      const dir = (base + movtab[i]) & 3;
      if (this.tryMove(idx, dir, game)) return;
    }
    this.tryMove(idx, (base + 2) & 3, game);
  }

  tryMove(idx, dir, game) {
    const c = this.list[idx];
    const { dungeon, player } = game;
    if (!dungeon.canMove(c.row, c.col, dir)) return false;
    const next = dungeon.step(c.row, c.col, dir);
    if (!dungeon.isPassable(next.row, next.col)) return false;
    if (this.cellOccupied(next.row, next.col, idx) >= 0) return false;
    c.facing = dir;
    c.row = next.row;
    c.col = next.col;

    if (c.row === player.row && c.col === player.col) {
      c.atkAt = performance.now() + c.atkMs;
    }

    if (c.objChain >= 0) {
      const obj = game.objects.pool[c.objChain];
      obj.row = c.row;
      obj.col = c.col;
    }
    return true;
  }

  regen(game) {
    const base = this.cmxPtr(game.level);
    let total = 0;
    for (let t = 0; t < CTYPES; t++) total += this.regenCounts[base + t];
    if (total >= 32) return;
    let pick = game.rng.random() & 7;
    pick += 2;
    if (pick < CTYPES) {
      this.regenCounts[base + pick]++;
      this.birth(pick, game.dungeon);
      game.log('YOU HEAR MOVEMENT.');
    }
  }

  serialize() {
    return {
      list: this.list.map((c) => ({ ...c })),
      frozen: this.frozen,
      regenCounts: [...this.regenCounts],
    };
  }

  deserialize(data) {
    this.list = data.list.map((c) => ({ ...c }));
    this.frozen = data.frozen;
    this.regenCounts = [...data.regenCounts];
  }
}