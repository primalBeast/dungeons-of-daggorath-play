export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.row = 16;
    this.col = 11;
    this.dir = 0;
    this.power = 160;
    this.damage = 0;
    this.weight = 35;
    this.maxWeight = 200;
    this.leftHand = -1;
    this.rightHand = -1;
    this.torch = -1;
    this.bag = -1;
    this.faint = 0;
    this.invulnUntil = 0;
    this.rLight = 0;
    this.mLight = 0;
    this.heartPhase = 0;
    this.heartScale = 1;
    this.mgo = 0;
    this.mgd = 255;
    this.pho = 128;
    this.phd = 255;
    this.moveDelay = 250;
    this.turnDelay = 200;
    this.lastMove = 0;
    this.lastTurn = 0;
  }

  handName(side, objects) {
    const id = side === 'L' ? this.leftHand : this.rightHand;
    return objects.name(id);
  }

  updateShield(objects) {
    this.mgo = 0x80;
    this.mgd = 0x80;
    this.pho = 0x80;
    this.phd = 0x80;
    for (const hid of [this.leftHand, this.rightHand]) {
      if (hid < 0) continue;
      const def = objects.def(hid);
      if (def?.cls !== 'SHIELD') continue;
      const mag = def.magDef ?? 255;
      const phys = def.physDef ?? 255;
      if (mag < this.mgo) this.mgo = mag;
      if (phys < this.phd) this.phd = phys;
    }
  }

  effectivePower() {
    return Math.max(1, this.power - this.damage * 2);
  }

  heartRate() {
    const p = this.power;
    const d = this.damage;
    const denom = p + d * 2;
    return Math.floor((p * 64) / denom) - 18;
  }

  heartbeatInterval() {
    const hr = Math.max(1, this.heartRate());
    return Math.max(180, hr * 17);
  }

  slowDamage() {
    this.damage -= this.damage >> 6;
    if (this.damage < 0) this.damage = 0;
  }

  serialize() {
    return { ...this };
  }

  deserialize(data) {
    Object.assign(this, data);
  }
}