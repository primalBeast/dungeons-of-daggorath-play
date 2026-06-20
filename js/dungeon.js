import {
  GRID, LEVTAB, VFTTAB, VF, HF, N_WALL, E_WALL, S_WALL, W_WALL, STPTAB,
} from './data.js';
import { RNG } from './rng.js';
const MSK = [0x03, 0x0c, 0x30, 0xc0];
const DOR = [HF.DOR, HF.DOR << 2, HF.DOR << 4, HF.DOR << 6];
const SDR = [HF.SDR, HF.SDR << 2, HF.SDR << 4, HF.SDR << 6];

export class Dungeon {
  constructor(rng) {
    this.rng = rng;
    this.maze = new Uint8Array(GRID * GRID);
    this.vftPtr = 0;
  }

  rc2idx(r, c) {
    return ((r & 31) * GRID) + (c & 31);
  }

  border(r, c) {
    return (r & 0xe0) === 0 && (c & 0xe0) === 0;
  }

  calcVfi(level) {
    let idx = 0;
    for (let l = 0; l <= level; l++) {
      this.vftPtr = idx;
      while (VFTTAB[idx] !== -1) idx++;
      idx++;
    }
  }

  vfind(row, col) {
    let u = this.vftPtr;
    while (u < VFTTAB.length) {
      const a = VFTTAB[u++];
      if (a === -1) break;
      const r = VFTTAB[u++];
      const c = VFTTAB[u++];
      if (r === row && c === col) return a;
    }
    if (u < VFTTAB.length && VFTTAB[u] === -1) u++;
    while (u < VFTTAB.length) {
      if (VFTTAB[u] === -1) break;
      const a = VFTTAB[u++];
      const r = VFTTAB[u++];
      const c = VFTTAB[u++];
      if (r === row && c === col) return a + 2;
    }
    return null;
  }

  forEachTransitionCell(fn) {
    const scan = (start) => {
      let i = start;
      while (i < VFTTAB.length && VFTTAB[i] !== -1) {
        fn(VFTTAB[i + 1], VFTTAB[i + 2], VFTTAB[i]);
        i += 3;
      }
      return i;
    };
    let end = scan(this.vftPtr);
    if (end + 1 < VFTTAB.length && VFTTAB[end + 1] === -1) end++;
    if (end + 1 < VFTTAB.length) scan(end + 1);
  }

  openPassage(row, col, dir) {
    const idx = this.rc2idx(row, col);
    const n = this.step(row, col, dir);
    if (!this.border(n.row, n.col)) return;
    const nidx = this.rc2idx(n.row, n.col);
    this.maze[idx] &= ~MSK[dir];
    this.maze[nidx] &= ~MSK[(dir + 2) & 3];
  }

  canReachOriginalMaze(row, col, wasPassable) {
    const start = this.rc2idx(row, col);
    const queue = [[row, col]];
    const seen = new Set([start]);
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      for (let dir = 0; dir < 4; dir++) {
        if (!this.canMove(r, c, dir)) continue;
        const n = this.step(r, c, dir);
        if (!this.isPassable(n.row, n.col)) continue;
        const ni = this.rc2idx(n.row, n.col);
        if (seen.has(ni)) continue;
        if (wasPassable[ni]) return true;
        seen.add(ni);
        queue.push([n.row, n.col]);
      }
    }
    return !!wasPassable[start];
  }

  /** Link a ladder/hole cell into the main maze (carve a tunnel if needed). */
  connectTransitionCell(row, col, wasPassable) {
    const startIdx = this.rc2idx(row, col);
    if (this.maze[startIdx] === 0xff) this.maze[startIdx] = 0;

    if (this.canReachOriginalMaze(row, col, wasPassable)) return;

    const queue = [[row, col]];
    const seen = new Set([startIdx]);
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      for (let dir = 0; dir < 4; dir++) {
        const n = this.step(r, c, dir);
        if (!this.border(n.row, n.col)) continue;
        const curIdx = this.rc2idx(r, c);
        const ni = this.rc2idx(n.row, n.col);

        this.openPassage(r, c, dir);
        if (this.maze[ni] === 0xff) this.maze[ni] = 0;

        if (seen.has(ni)) continue;
        seen.add(ni);
        if (wasPassable[ni]) return;
        queue.push([n.row, n.col]);
      }
    }
  }

  repairPassageSymmetry() {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!this.isPassable(r, c)) continue;
        for (let dir = 0; dir < 4; dir++) {
          const n = this.step(r, c, dir);
          if (!this.border(n.row, n.col) || !this.isPassable(n.row, n.col)) continue;
          const back = (dir + 2) & 3;
          if (this.canMove(r, c, dir) !== this.canMove(n.row, n.col, back)) {
            this.openPassage(r, c, dir);
          }
        }
      }
    }
  }

  /** Carve and connect fixed ladder/hole coordinates for this level. */
  ensureTransitionCells() {
    const wasPassable = new Uint8Array(GRID * GRID);
    for (let i = 0; i < this.maze.length; i++) {
      wasPassable[i] = this.maze[i] !== 0xff ? 1 : 0;
    }
    this.forEachTransitionCell((row, col) => {
      this.connectTransitionCell(row, col, wasPassable);
    });
    this.repairPassageSymmetry();
  }

  rndDir() {
    return { dir: this.rng.random() & 3, dst: (this.rng.random() & 7) + 1 };
  }

  friend(row, col, out) {
    for (let i = 0; i < 9; i++) out[i] = 0xff;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (!this.border(nr, nc)) continue;
        const v = this.maze[this.rc2idx(nr, nc)];
        out[(dr + 1) * 3 + (dc + 1)] = v === 0xff ? 0xff : 0;
      }
    }
  }

  generate(level) {
    this.maze.fill(0xff);
    this.rng.setSeed(LEVTAB[level], LEVTAB[level + 1], LEVTAB[level + 2]);

    let cellCtr = 500;
    let drow = { row: this.rng.random() & 31, col: this.rng.random() & 31 };
    let { dir, dst } = this.rndDir();
    const startIdx = this.rc2idx(drow.row, drow.col);
    this.maze[startIdx] = 0;
    cellCtr--;

    let guard = 0;
    while (cellCtr > 0) {
      if (++guard > 200000) {
        this.carveRemaining(cellCtr);
        break;
      }
      let brow = drow.row;
      let bcol = drow.col;
      brow += STPTAB[dir * 2];
      bcol += STPTAB[dir * 2 + 1];

      if (!this.border(brow, bcol)) {
        ({ dir, dst } = this.rndDir());
        continue;
      }

      const idx = this.rc2idx(brow, bcol);
      if (this.maze[idx] === 0xff) {
        const nb = new Array(9);
        this.friend(brow, bcol, nb);
        if (
          nb[3] + nb[0] + nb[1] === 0 ||
          nb[1] + nb[2] + nb[5] === 0 ||
          nb[5] + nb[8] + nb[7] === 0 ||
          nb[7] + nb[6] + nb[3] === 0
        ) {
          ({ dir, dst } = this.rndDir());
          continue;
        }
        this.maze[idx] = 0;
        cellCtr--;
      }

      drow = { row: brow, col: bcol };
      dst--;
      if (dst === 0) ({ dir, dst } = this.rndDir());
    }

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const idx = this.rc2idx(r, c);
        if (this.maze[idx] === 0xff) continue;
        const nb = new Array(9);
        this.friend(r, c, nb);
        let v = this.maze[idx];
        if (nb[1] === 0xff) v |= N_WALL;
        if (nb[3] === 0xff) v |= W_WALL;
        if (nb[5] === 0xff) v |= E_WALL;
        if (nb[7] === 0xff) v |= S_WALL;
        this.maze[idx] = v;
      }
    }

    for (let i = 0; i < 28; i++) this.makeDoor(DOR);
    for (let i = 0; i < 8; i++) this.makeDoor(SDR);

    this.ensureTransitionCells();

    this.rng.spin(level === 0 ? 6 : 21);
    return drow;
  }

  hasAnyDoor(val) {
    for (let d = 0; d < 4; d++) {
      const wt = (val >> (d * 2)) & 3;
      if (wt === HF.DOR || wt === HF.SDR) return true;
    }
    return false;
  }

  makeDoor(table) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const col = this.rng.random() & 31;
      const row = this.rng.random() & 31;
      const idx = this.rc2idx(row, col);
      const val = this.maze[idx];
      if (val === 0xff || this.hasAnyDoor(val)) continue;

      const dir = this.rng.random() & 3;
      if ((val & MSK[dir]) !== 0) continue;

      const nrow = row + STPTAB[dir * 2];
      const ncol = col + STPTAB[dir * 2 + 1];
      if (!this.border(nrow, ncol)) continue;

      const nidx = this.rc2idx(nrow, ncol);
      const nval = this.maze[nidx];
      if (nval === 0xff || this.hasAnyDoor(nval)) continue;

      const odir = (dir + 2) & 3;
      if ((nval & MSK[odir]) !== 0) continue;

      this.maze[idx] |= table[dir];
      this.maze[nidx] &= ~MSK[odir];
      return;
    }
  }

  pickPlayerSpawn(creatures, minDist = 5) {
    const active = creatures.list.filter((c) => c.active);

    const minCreatureDist = (row, col) => {
      if (active.length === 0) return Infinity;
      let best = Infinity;
      for (const c of active) {
        const d = Math.abs(row - c.row) + Math.abs(col - c.col);
        if (d < best) best = d;
      }
      return best;
    };

    const collect = (dist) => {
      const spots = [];
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (!this.isPassable(r, c)) continue;
          if (creatures.atCell(r, c) >= 0) continue;
          if (minCreatureDist(r, c) >= dist) spots.push({ row: r, col: c });
        }
      }
      return spots;
    };

    for (const dist of [minDist, 3, 2, 0]) {
      const spots = collect(dist);
      if (spots.length > 0) {
        return spots[this.rng.random() % spots.length];
      }
    }

    return { row: 0, col: 0 };
  }

  wallAt(row, col, dir) {
    const v = this.maze[this.rc2idx(row, col)];
    return (v >> (dir * 2)) & 3;
  }

  canMove(row, col, dir) {
    return this.wallAt(row, col, dir) !== HF.WAL;
  }

  step(row, col, dir) {
    return {
      row: row + STPTAB[dir * 2],
      col: col + STPTAB[dir * 2 + 1],
    };
  }

  neighbors(row, col) {
    const v = this.maze[this.rc2idx(row, col)];
    return [v & 3, (v >> 2) & 3, (v >> 4) & 3, (v >> 6) & 3];
  }

  isPassable(row, col) {
    return this.maze[this.rc2idx(row, col)] !== 0xff;
  }

  carveRemaining(count) {
    for (let r = 0; r < GRID && count > 0; r++) {
      for (let c = 0; c < GRID && count > 0; c++) {
        const idx = this.rc2idx(r, c);
        if (this.maze[idx] === 0xff) {
          this.maze[idx] = 0;
          count--;
        }
      }
    }
  }

  ensureCell(row, col) {
    const idx = this.rc2idx(row, col);
    if (this.maze[idx] === 0xff) {
      this.maze[idx] = 0;
    }
  }
}