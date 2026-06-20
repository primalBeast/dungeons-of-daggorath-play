// Combat routines from original Dungeons of Daggorath (PATTK.ASM / player.cpp)

export function attackHit(rng, attackerPow, defenderPow, defenderDamage) {
  let t0 = 15;
  let dval = (defenderPow - defenderDamage) * 4;
  while (t0 > 0) {
    dval -= attackerPow;
    if (dval < 0) break;
    t0--;
  }
  const pidx = t0 - 3;
  const adjust = pidx > 0 ? pidx * 10 : pidx * 25;
  const roll = rng.random() + adjust - 127;
  return roll >= 0;
}

export function calcDamage(attackerPow, atkMgo, atkPho, defMgd, defPhd) {
  let mag = ((attackerPow * atkMgo) >> 7);
  mag = ((mag * defMgd) >> 7);
  let phys = ((attackerPow * atkPho) >> 7);
  phys = ((phys * defPhd) >> 7);
  return mag + phys;
}

export function inflictDamage(attackerPow, atkMgo, atkPho, defenderPow, defMgd, defPhd, defenderDamage) {
  const dealt = calcDamage(attackerPow, atkMgo, atkPho, defMgd, defPhd);
  const total = defenderDamage + dealt;
  return {
    dealt,
    total,
    alive: defenderPow > total,
  };
}

export function weaponOffense(objects, objId) {
  if (objId < 0) {
    return { mgo: 0, pho: 5 };
  }
  const def = objects.def(objId);
  return {
    mgo: def?.mgo ?? 0,
    pho: def?.pho ?? 5,
  };
}

export function isIncantableRing(objects, objId) {
  if (objId < 0) return false;
  const def = objects.def(objId);
  return def?.cls === 'RING' && !!def.ringWord;
}

// Back-compat aliases used elsewhere
export function applyDamage(attackerPow, atkMgo, atkPho, defenderPow, defMgd, defPhd, damageAcc) {
  const base = damageAcc.mag + damageAcc.phys;
  const result = inflictDamage(attackerPow, atkMgo, atkPho, defenderPow, defMgd, defPhd, base);
  damageAcc.mag = result.total;
  damageAcc.phys = 0;
  return result.alive;
}

export function weaponStats(objects, objId) {
  const off = weaponOffense(objects, objId);
  return { ...off, pow: Math.max(off.pho, off.mgo) };
}