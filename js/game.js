import { RNG } from './rng.js';
import { Dungeon } from './dungeon.js';
import { ObjectManager } from './objects.js';
import { CreatureManager } from './creatures.js';
import { Player } from './player.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import {
  attackHit, inflictDamage, weaponOffense, isIncantableRing,
} from './combat.js';
import {
  parseLine, resolveHand, resolveDirection, resolveObject, resolveRingWord,
} from './parser.js';
import { OBJ, VF, CREATURE_DB } from './data.js';

const SAVE_KEY = 'daggorath-save';
const REGEN_MS = 300000;
const TORCH_TICK_MS = 5000;
const FINALE_MS = 2200;
const FINALE_FLASH_MS = 550;

export class Game {
  constructor(ui) {
    this.ui = ui;
    this.rng = new RNG();
    this.dungeon = new Dungeon(this.rng);
    this.objects = new ObjectManager(this.rng);
    this.creatures = new CreatureManager(this);
    this.player = new Player();
    this.renderer = new Renderer(ui.canvas, ui.minimap, ui.heart);
    this.explored = new Uint8Array(32 * 32);
    this.audio = new AudioEngine();
    this.level = 0;
    this.logLines = [];
    this.running = false;
    this.won = false;
    this.dead = false;

    this.regenAt = 0;
    this.torchAt = 0;
    this.heartSlowAt = 0;
    this.faintWakeAt = 0;
    this.lastBeat = 0;
    this.stripInventory = false;
    this.paused = false;
    this.pauseStartedAt = 0;
    this.turnAnim = null;
    this.findFlash = null;
    this.finale = null;
  }

  beginFinale(ms, fn) {
    if (this.finale) return;
    this.finale = {
      until: performance.now() + ms,
      fn,
    };
  }

  tickFinale(now) {
    if (!this.finale || now < this.finale.until) return;
    const fn = this.finale.fn;
    this.finale = null;
    fn();
  }

  triggerFindFlash() {
    this.findFlash = {
      startMs: performance.now(),
      durationMs: 2400,
    };
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.pauseStartedAt = performance.now();
  }

  resume() {
    if (!this.paused) return;
    const delta = performance.now() - this.pauseStartedAt;
    this.paused = false;
    this.regenAt += delta;
    this.torchAt += delta;
    this.heartSlowAt += delta;
    this.faintWakeAt += delta;
    this.lastBeat += delta;
    this.player.invulnUntil += delta;
    this.player.lastMove += delta;
    this.player.lastTurn += delta;
    if (this.turnAnim) this.turnAnim.startMs += delta;
    if (this.findFlash) this.findFlash.startMs += delta;
    if (this.finale) this.finale.until += delta;
    for (const c of this.creatures.list) {
      if (!c.active) continue;
      c.moveAt += delta;
      c.atkAt += delta;
    }
  }

  start() {
    this.audio.resume();
    this.newGame();
    this.running = true;
    this.loop(performance.now());
  }

  newGame() {
    this.ui.hideOverlay?.();
    if (this.paused) this.resume();
    this.turnAnim = null;
    this.findFlash = null;
    this.finale = null;
    this.level = 0;
    this.won = false;
    this.dead = false;
    this.audio.unmute();
    this.logLines = [];
    this.objects.reset();
    this.creatures.reset();
    this.player.reset();
    this.loadLevel(true);
    this.log('PREPARE!');
    this.log('A FAINT LIGHT FILTERS FROM ABOVE.');
  }

  loadLevel(isNew) {
    this.dungeon.calcVfi(this.level);
    this.dungeon.generate(this.level);
    this.creatures.list.forEach((c) => { c.active = false; });
    this.creatures.spawnLevel(this.level, this.dungeon);
    this.creatures.dedupeCells(this.dungeon);
    this.objects.assignToCreatures(this.level, this.creatures, this.dungeon);
    if (isNew) {
      const entropy = (
        (Date.now() & 0xff)
        ^ (performance.now() & 0xff)
        ^ ((Math.random() * 256) | 0)
      ) || 1;
      this.rng.spin(entropy);
    }
    const spawn = this.dungeon.pickPlayerSpawn(this.creatures);
    this.player.row = spawn.row;
    this.player.col = spawn.col;
    this.dungeon.ensureCell(this.player.row, this.player.col);

    if (isNew && this.level === 0) {
      const torch = this.objects.createHeld(OBJ.PINE);
      const sword = this.objects.createHeld(OBJ.WOODEN);
      this.player.leftHand = torch;
      this.player.rightHand = sword;
      this.player.torch = torch;
      this.player.bag = -1;
      this.useTorch();
    }
    this.player.dir = 0;
    this.renderer.setInverted(this.level % 2 === 1);
    this.regenAt = performance.now() + REGEN_MS;
    this.torchAt = performance.now() + TORCH_TICK_MS;
    this.ui.setLevel(this.level);
    this.resetExplored();
    this.revealAround(this.player.row, this.player.col, 2);
    this.updateHands();
  }

  resetExplored() {
    this.explored.fill(0);
  }

  revealAround(row, col, radius) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= 32 || c < 0 || c >= 32) continue;
        if (this.dungeon.isPassable(r, c)) {
          this.explored[r * 32 + c] = 1;
        }
      }
    }
    if (row >= 0 && row < 32 && col >= 0 && col < 32) {
      this.explored[row * 32 + col] = 1;
    }
  }

  formatLog() {
    return [...this.logLines].reverse().join('\n');
  }

  log(msg) {
    this.logLines.push(msg);
    if (this.logLines.length > 80) this.logLines.shift();
    this.ui.setLog(this.formatLog());
  }

  updateHands() {
    this.ui.setHands(
      this.player.handName('L', this.objects),
      this.player.handName('R', this.objects),
    );
  }

  useTorch() {
    const t = this.player.torch;
    if (t < 0) {
      this.player.rLight = 0;
      this.player.mLight = 0;
      return;
    }
    const lit = this.objects.useTorch(t);
    if (!lit) {
      this.player.rLight = 0;
      this.player.mLight = 0;
      return;
    }
    this.player.rLight = lit.rLight;
    this.player.mLight = lit.mLight;
    if (lit.dead) this.log('YOUR TORCH DIES.');
  }

  loop(now) {
    if (!this.running) return;
    this.tickFinale(now);
    if (!this.paused && !this.dead && !this.won && !this.finale) {
      if (this.player.faint !== 0) {
        this.tickFaint(now);
      } else {
        this.creatures.update(now, this);
        if (now >= this.regenAt) {
          this.creatures.regen(this);
          this.regenAt = now + REGEN_MS;
        }
        if (now >= this.torchAt) {
          if (this.player.torch >= 0) {
            this.objects.tickTorch(this.player.torch);
            this.useTorch();
          }
          this.torchAt = now + TORCH_TICK_MS;
        }
        this.tickHeartRecovery(now);
      }
    }

    if (!this.paused && !this.dead && now - this.lastBeat >= this.player.heartbeatInterval()) {
      this.audio.playHeartbeat(
        this.player.heartbeatInterval(),
        Math.min(1, this.player.damage / Math.max(this.player.power, 1)),
      );
      this.lastBeat = now;
    }

    this.renderer.draw(this, now);
    this.renderer.drawMinimap(this, now);
    this.renderer.drawHeart(this.player, now);
    requestAnimationFrame((t) => this.loop(t));
  }

  handleCommand(line) {
    if (line.trim() === '?') {
      this.log('> ?');
      this.ui.showHelp?.();
      return;
    }
    if (line.trim().toLowerCase() === 'theme') {
      this.log('> THEME');
      this.ui.showTheme?.();
      return;
    }
    const meta = line.trim().toLowerCase();
    if (meta === 'creatures' || meta === 'cre') {
      this.log(`> ${line.trim().toUpperCase()}`);
      this.ui.showCreatures?.();
      return;
    }
    if (line.trim().toLowerCase() === 'f') {
      this.log('> F');
      this.triggerFindFlash();
      return;
    }
    const parsed = parseLine(line);
    if (parsed.ok && parsed.cmd === 'RESTART') {
      this.log(`> ${line.trim().toUpperCase()}`);
      this.newGame();
      return;
    }
    if (this.finale) return;
    if (this.dead) return;
    if (this.paused) return;
    if (this.player.faint !== 0) return;
    if (!parsed.ok) {
      this.log(parsed.error);
      return;
    }
    this.log(`> ${line.trim().toUpperCase()}`);
    const { cmd, args } = parsed;
    switch (cmd) {
      case 'MOVE': this.cmdMove(args); break;
      case 'TURN': this.cmdTurn(args); break;
      case 'CLIMB': this.cmdClimb(args); break;
      case 'GET': this.cmdGet(args); break;
      case 'PULL': this.cmdPull(args); break;
      case 'DROP': this.cmdDrop(args); break;
      case 'STOW': this.cmdStow(args); break;
      case 'ATTACK': this.cmdAttack(args); break;
      case 'USE': this.cmdUse(args); break;
      case 'REVEAL': this.cmdReveal(args); break;
      case 'INCANT': this.cmdIncant(args); break;
      case 'EXAMINE': this.cmdExamine(args); break;
      case 'LOOK': this.cmdLook(args); break;
      case 'ZSAVE': this.cmdSave(); break;
      case 'ZLOAD': this.cmdLoad(); break;
      default: this.log('?'); break;
    }
    this.updateHands();
  }

  cmdMove(args) {
    if (this.turnAnim) {
      this.log('WAIT...');
      return;
    }
    const dir = resolveDirection(args);
    const now = performance.now();
    if (now - this.player.lastMove < this.player.moveDelay) {
      this.log('WAIT...');
      return;
    }
    let d = this.player.dir;
    if (dir === 'BACK') d = (this.player.dir + 2) & 3;
    else if (dir === 'LEFT') d = (this.player.dir + 3) & 3;
    else if (dir === 'RIGHT') d = (this.player.dir + 1) & 3;
    if (!this.dungeon.canMove(this.player.row, this.player.col, d)) {
      this.log('BLOCKED.');
      return;
    }
    const next = this.dungeon.step(this.player.row, this.player.col, d);
    if (!this.dungeon.isPassable(next.row, next.col)) {
      this.log('BLOCKED.');
      return;
    }
    this.player.row = next.row;
    this.player.col = next.col;
    this.player.lastMove = now;
    const cidx = this.creatures.atCell(this.player.row, this.player.col);
    if (cidx >= 0) {
      this.creatures.list[cidx].atkAt = now + this.creatures.list[cidx].atkMs;
    }
    this.revealAround(this.player.row, this.player.col, 1);
  }

  cmdTurn(args) {
    if (this.turnAnim) {
      this.log('WAIT...');
      return;
    }
    const dir = resolveDirection(args);
    const now = performance.now();
    if (now - this.player.lastTurn < this.player.turnDelay) {
      this.log('WAIT...');
      return;
    }
    const fromDir = this.player.dir;
    let toDir = fromDir;
    let kind = null;
    if (dir === 'LEFT') {
      toDir = (fromDir + 3) & 3;
      kind = 'left';
    } else if (dir === 'RIGHT') {
      toDir = (fromDir + 1) & 3;
      kind = 'right';
    } else if (dir === 'AROUND') {
      toDir = (fromDir + 2) & 3;
      kind = 'around';
    } else {
      this.log('?');
      return;
    }

    const durationMs = kind === 'around' ? 480 : 300;
    this.turnAnim = { fromDir, toDir, kind, startMs: now, durationMs };
    this.player.dir = toDir;
    this.player.lastTurn = now;
    this.revealAround(this.player.row, this.player.col, 1);
  }

  cmdClimb(args) {
    const dir = resolveDirection(args);
    const vfi = this.dungeon.vfind(this.player.row, this.player.col);
    if (vfi === null) { this.log('?'); return; }
    if (dir === 'UP') {
      if (vfi === VF.LADDER_UP || (vfi === VF.HOLE_UP && this.creatures.frozen > 0)) {
        if (this.level === 0) { this.log('?'); return; }
        this.level--;
        this.loadLevel(false);
        this.log('YOU CLIMB UP.');
      } else this.log('?');
    } else if (dir === 'DOWN') {
      if (vfi === VF.LADDER_DOWN || vfi === VF.HOLE_DOWN) {
        if (this.level >= 4) { this.log('?'); return; }
        this.level++;
        this.loadLevel(false);
        this.log('YOU CLIMB DOWN.');
      } else this.log('?');
    } else this.log('?');
  }

  handId(side) {
    if (side === 'L') return this.player.leftHand;
    if (side === 'R') return this.player.rightHand;
    return -1;
  }

  setHand(side, id) {
    if (side === 'L') this.player.leftHand = id;
    else this.player.rightHand = id;
  }

  cmdGet(args) {
    const { hand, rest } = resolveHand(args);
    const { cls, type } = resolveObject(rest);
    const side = hand ?? 'R';
    const hid = this.handId(side);
    if (hid >= 0) { this.log('HAND FULL.'); return; }
    const oid = this.objects.matchFloor(this.level, this.player.row, this.player.col, cls, type);
    if (oid < 0) { this.log('NOT HERE.'); return; }
    const w = this.objects.weight(oid);
    if (this.player.weight + w > this.player.maxWeight) {
      this.log('TOO HEAVY.');
      return;
    }
    this.objects.takeFromFloor(oid);
    this.setHand(side, oid);
    this.player.weight += w;
    this.log(`GOT ${this.objects.name(oid)}.`);
  }

  cmdPull(args) {
    const { hand, rest } = resolveHand(args);
    const { cls, type } = resolveObject(rest);
    const side = hand ?? 'R';
    const hid = this.handId(side);
    if (hid >= 0) { this.log('HAND FULL.'); return; }
    if (this.player.bag < 0) { this.log('NOT HERE.'); return; }
    if (!cls && !type) { this.log('NOT HERE.'); return; }

    const fromBag = this.pullFromBag(cls, type);
    if (fromBag < 0) { this.log('NOT HERE.'); return; }

    this.setHand(side, fromBag);
    if (this.player.torch === fromBag) {
      this.player.torch = -1;
      this.useTorch();
    }
    this.log(`PULLED ${this.objects.name(fromBag)}.`);
  }

  pullFromBag(cls, type) {
    let prev = -1;
    let id = this.player.bag;
    while (id >= 0) {
      const next = this.objects.pool[id].next;
      if (this.objects.matchHeld(id, cls, type)) {
        if (prev < 0) this.player.bag = next;
        else this.objects.pool[prev].next = next;
        this.objects.pool[id].next = -1;
        this.objects.pool[id].owner = 1;
        return id;
      }
      prev = id;
      id = next;
    }
    return -1;
  }

  listBagItems() {
    const items = [];
    let id = this.player.bag;
    while (id >= 0) {
      items.push(id);
      id = this.objects.pool[id].next;
    }
    return items;
  }

  cmdDrop(args) {
    const { hand } = resolveHand(args);
    const side = hand ?? 'R';
    const hid = this.handId(side);
    if (hid < 0) { this.log('EMPTY.'); return; }
    this.objects.drop(hid, this.player.row, this.player.col, this.level);
    this.player.weight -= this.objects.weight(hid);
    this.setHand(side, -1);
    if (this.player.torch === hid) {
      this.player.torch = -1;
      this.useTorch();
    }
    this.log('DROPPED.');
  }

  cmdStow(args) {
    const { hand } = resolveHand(args);
    const side = hand ?? 'R';
    const hid = this.handId(side);
    if (hid < 0) { this.log('EMPTY.'); return; }
    const tail = this.findBagTail();
    if (this.player.bag < 0) {
      this.player.bag = hid;
    } else {
      this.objects.pool[tail].next = hid;
    }
    this.objects.pool[hid].next = -1;
    this.setHand(side, -1);
    this.log('STOWED.');
  }

  findBagTail() {
    let id = this.player.bag;
    if (id < 0) return -1;
    while (this.objects.pool[id].next >= 0) {
      id = this.objects.pool[id].next;
    }
    return id;
  }

  cmdAttack(args) {
    const { hand } = resolveHand(args);
    const side = hand ?? 'R';
    const hid = this.handId(side);
    if (hid >= 0 && this.objects.def(hid)?.cls === 'SWORD') {
      this.audio.playSwoosh();
    }
    const offense = weaponOffense(this.objects, hid);
    const cidx = this.creatures.attackTarget(this.player);
    if (cidx < 0) { this.log('NOTHING TO ATTACK.'); return; }
    const c = this.creatures.list[cidx];
    if (c.dying) return;
    const ap = this.player.power;
    const ringHit = isIncantableRing(this.objects, hid);
    const cdam = c.damage ?? 0;
    const hit = ringHit || attackHit(this.rng, ap, c.hp, cdam);
    if (!hit) {
      this.log('MISS!');
      this.audio.playSound('miss');
      this.updateHealth();
      return;
    }
    const torchDead = this.player.torch < 0
      || this.objects.def(this.player.torch)?.timer === 0;
    if (torchDead && !ringHit && (this.rng.random() & 3) !== 0) {
      this.log('MISS!');
      this.audio.playSound('miss');
      this.updateHealth();
      return;
    }
    const result = inflictDamage(
      ap, offense.mgo, offense.pho, c.hp, c.mgd, c.phd, cdam,
    );
    c.damage = result.total;
    this.audio.playSound('hit');
    if (!result.alive) {
      this.renderer.triggerAttackFlash(this, cidx, FINALE_FLASH_MS);
      this.log(`HIT ${this.creatures.name(c.type)}.`);
      this.onCreatureKill(cidx);
    } else {
      this.renderer.triggerAttackFlash(this, cidx);
      this.log(`HIT ${this.creatures.name(c.type)}.`);
    }
    this.updateHealth();
  }

  onCreatureKill(cidx) {
    const c = this.creatures.list[cidx];
    c.dying = false;
    const db = CREATURE_DB[c.type];
    this.audio.playSound('bang');
    this.log(`${this.creatures.name(c.type)} DIES.`);
    this.creatures.kill(cidx, this);
    this.player.power += db.hp >> 3;
    if (c.type === 10) {
      this.log('THE IMAGE FADES...');
      this.stripToTorch();
      this.level = 3;
      this.loadLevel(false);
      const tp = this.dungeon.pickPlayerSpawn(this.creatures);
      this.player.row = tp.row;
      this.player.col = tp.col;
      this.dungeon.ensureCell(this.player.row, this.player.col);
      this.revealAround(this.player.row, this.player.col, 2);
      this.log('YOU AWAKEN ON LEVEL 4.');
    } else if (c.type === 11) {
      this.creatures.frozen--;
      this.player.rLight = 7;
      this.player.mLight = 19;
      const ring = this.objects.createHeld(OBJ.SUPREME);
      this.player.rightHand = ring;
      this.log('A RING MATERIALIZES.');
    }
    this.updateHealth();
  }

  stripToTorch() {
    const torch = this.player.torch;
    this.player.leftHand = -1;
    this.player.rightHand = -1;
    this.player.bag = torch >= 0 ? torch : -1;
    this.player.weight = 200;
    if (torch >= 0) this.objects.pool[torch].next = -1;
  }

  cmdUse(args) {
    const { hand } = resolveHand(args);
    const side = hand ?? 'R';
    const hid = this.handId(side);
    if (hid < 0) { this.log('EMPTY.'); return; }
    const def = this.objects.def(hid);
    if (def?.cls === 'TORCH') {
      this.player.torch = hid;
      this.useTorch();
      this.log('TORCH LIT.');
    } else if (def?.cls === 'FLASK') {
      this.drinkFlask(hid, side);
    } else if (def?.cls === 'RING' && def.charges !== undefined) {
      this.log('INCANT FIRST.');
    } else {
      this.log('?');
    }
  }

  drinkFlask(hid, side) {
    const type = this.objects.pool[hid].type;
    if (type === OBJ.HALE) {
      this.player.damage = Math.max(0, this.player.damage - 40);
      this.log('YOU FEEL BETTER.');
    } else if (type === OBJ.ABYE) {
      this.player.damage = 0;
      this.log('RESTORED.');
    } else if (type === OBJ.THEWS) {
      this.player.maxWeight = 400;
      this.log('STRENGTH SURGES.');
    } else {
      this.log('?');
      return;
    }
    this.objects.pool[hid].type = OBJ.EMPTY;
    this.updateHealth();
  }

  cmdReveal(args) {
    const { hand } = resolveHand(args);
    const side = hand ?? 'R';
    const hid = this.handId(side);
    if (hid < 0) { this.log('EMPTY.'); return; }
    const obj = this.objects.pool[hid];
    const def = this.objects.def(hid);
    if (def?.cls !== 'RING' && def?.cls !== 'SCROLL') { this.log('?'); return; }
    const req = def.rev ?? 0;
    if (req > 0 && this.player.power < req * 25) {
      this.log('TOO WEAK.');
      return;
    }
    obj.reveal = 0;
    this.log(`IT IS ${def.name}.`);
  }

  cmdIncant(args) {
    const word = resolveRingWord(args);
    if (!word) { this.log('?'); return; }
    const hid = this.player.rightHand;
    if (hid < 0 || this.objects.def(hid)?.cls !== 'RING') {
      this.log('?');
      return;
    }
    if (this.objects.activateRing(hid, word)) {
      this.audio.playSound('incant');
      this.log(`${word}!`);
      if (word === 'FINAL' && this.objects.pool[hid].type === OBJ.FINAL) {
        this.win();
      }
    } else {
      this.log('?');
    }
  }

  cmdExamine(args) {
    const { hand } = resolveHand(args);
    if (hand) {
      const hid = this.handId(hand);
      this.log(this.describeObject(hid));
      return;
    }

    const lines = [];
    const cidx = this.creatures.attackTarget(this.player);
    if (cidx >= 0) {
      const c = this.creatures.list[cidx];
      lines.push(
        `${this.creatures.name(c.type)}. HP~${Math.max(0, c.hp - (c.damage ?? 0))}`,
      );
    }

    for (const obj of this.objects.findAllOnFloor(
      this.level, this.player.row, this.player.col,
    )) {
      lines.push(this.describeObject(obj.id));
    }

    if (lines.length === 0) {
      const vfi = this.dungeon.vfind(this.player.row, this.player.col);
      if (vfi !== null) {
        lines.push(vfi <= 1 ? 'LADDER UP.' : 'HOLE DOWN.');
      }
    }

    if (this.player.leftHand >= 0) {
      lines.push(`LEFT HAND: ${this.describeObject(this.player.leftHand)}`);
    }
    if (this.player.rightHand >= 0) {
      lines.push(`RIGHT HAND: ${this.describeObject(this.player.rightHand)}`);
    }

    const bagItems = this.listBagItems();
    lines.push('PACK:');
    if (bagItems.length === 0) {
      lines.push('  (empty)');
    } else {
      for (const id of bagItems) {
        const label = this.describeObject(id);
        lines.push(this.player.torch === id ? `  *${label}` : `  ${label}`);
      }
    }

    const hasCarried = bagItems.length > 0
      || this.player.leftHand >= 0
      || this.player.rightHand >= 0;
    if (lines.length === 0 && !hasCarried) {
      this.log('NOTHING.');
      return;
    }

    this.log(lines.join('\n'));
  }

  describeObject(id) {
    if (id < 0) return 'EMPTY.';
    const obj = this.objects.pool[id];
    if (obj.reveal > 0) return 'SOMETHING STRANGE.';
    const def = this.objects.def(id);
    let s = def?.name ?? 'OBJECT';
    if (def?.charges) s += ` (${obj.charges})`;
    if (def?.cls === 'TORCH' && obj.timer > 0) s += ` T~${obj.timer}`;
    return s + '.';
  }

  cmdLook() {
    this.revealAround(this.player.row, this.player.col, 4);
    this.log('YOU STUDY THE MAP.');
  }

  tickHeartRecovery(now) {
    if (now < this.heartSlowAt) return;
    this.player.slowDamage();
    this.heartSlowAt = now + this.player.heartbeatInterval();
    this.updateHealth();
  }

  tickFaint(now) {
    if (now < this.heartSlowAt) return;
    this.player.slowDamage();
    this.heartSlowAt = now + this.player.heartbeatInterval();
    this.updateHealth(false);

    if (now < this.faintWakeAt) return;
    if (this.player.heartRate() >= 4) {
      this.wakeFromFaint(now);
    }
  }

  wakeFromFaint(now) {
    this.player.faint = 0;
    this.player.invulnUntil = now + 3000;
    this.player.lastMove = 0;
    this.player.lastTurn = 0;
    for (const c of this.creatures.list) {
      if (c.active && c.row === this.player.row && c.col === this.player.col) {
        c.atkAt = now + c.atkMs;
      }
    }
    this.log('YOU AWAKEN.');
  }

  creatureAttack(cidx) {
    const now = performance.now();
    if (this.player.faint !== 0 || now < this.player.invulnUntil) return;
    const c = this.creatures.list[cidx];
    this.renderer.triggerAttackFlash(this, cidx, FINALE_FLASH_MS);
    this.player.updateShield(this.objects);
    const db = CREATURE_DB[c.type];
    this.audio.playSound(db.sound);
    if (attackHit(this.rng, c.hp, this.player.power, this.player.damage)) {
      const result = inflictDamage(
        c.hp, c.mgo, c.pho, this.player.power,
        this.player.mgd, this.player.phd, this.player.damage,
      );
      this.player.damage = result.total;
      this.audio.playSound('clank');
      if (!result.alive) {
        this.beginFinale(FINALE_MS, () => this.die());
      } else {
        this.updateHealth();
      }
    }
  }

  updateHealth(checkFaint = true) {
    if (this.player.damage >= this.player.power) {
      if (!this.finale) this.beginFinale(FINALE_MS, () => this.die());
      return;
    }
    if (
      checkFaint &&
      this.player.faint === 0 &&
      this.player.heartRate() <= 3
    ) {
      const now = performance.now();
      this.player.faint = -1;
      this.faintWakeAt = now + 2500;
      this.heartSlowAt = now;
      this.log('YOU FAINT...');
    }
  }

  die() {
    this.dead = true;
    this.audio.silence();
    this.log('YOU DIE.');
    this.ui.showOverlay('YOU HAVE DIED.\nPress Enter or Restart to try again.');
  }

  win() {
    this.won = true;
    this.log('THE RING OF ENDINGS DESTROYS DAGGORATH.');
    this.ui.showOverlay('VICTORY!\nYou have destroyed the wizard\nand escaped the dungeons.\nPress Enter or Restart to play again.');
  }

  cmdSave() {
    const data = {
      level: this.level,
      player: this.player.serialize(),
      objects: this.objects.serialize(),
      creatures: this.creatures.serialize(),
      rng: [...this.rng.state],
      maze: Array.from(this.dungeon.maze),
      vftPtr: this.dungeon.vftPtr,
      explored: Array.from(this.explored),
      log: this.logLines,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    this.log('SAVED.');
  }

  cmdLoad() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { this.log('NO SAVE.'); return; }
    try {
      const data = JSON.parse(raw);
      this.level = data.level;
      this.player.deserialize(data.player);
      this.objects.deserialize(data.objects);
      this.creatures.deserialize(data.creatures);
      this.creatures.dedupeCells(this.dungeon);
      this.rng.state = data.rng;
      this.dungeon.maze = new Uint8Array(data.maze);
      this.dungeon.vftPtr = data.vftPtr;
      if (data.explored) {
        this.explored = new Uint8Array(data.explored);
      } else {
        this.resetExplored();
        this.revealAround(this.player.row, this.player.col, 2);
      }
      this.logLines = data.log ?? [];
      this.ui.setLog(this.formatLog());
      this.renderer.setInverted(this.level % 2 === 1);
      this.ui.setLevel(this.level);
      this.useTorch();
      this.dead = false;
      this.won = false;
      this.ui.hideOverlay();
      this.log('LOADED.');
    } catch {
      this.log('LOAD FAILED.');
    }
  }
}