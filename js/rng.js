export class RNG {
  constructor() {
    this.state = [0, 0, 0];
    this.carry = 0;
  }

  setSeed(a, b, c) {
    this.state = [a & 0xff, b & 0xff, c & 0xff];
    this.carry = 0;
  }

  lsl(c) {
    const v = c & 0xff;
    this.carry = (v & 0x80) ? 1 : 0;
    return (v << 1) & 0xff;
  }

  lsr(c) {
    const v = c & 0xff;
    this.carry = (v & 1) ? 1 : 0;
    return v >> 1;
  }

  rol(c) {
    const v = c & 0xff;
    const cry = (v & 0x80) ? 1 : 0;
    const out = ((v << 1) + this.carry) & 0xff;
    this.carry = cry;
    return out;
  }

  random() {
    this.carry = 0;
    for (let x = 8; x > 0; x--) {
      let b = 0;
      let a = this.state[2] & 0xe1;
      for (let y = 8; y > 0; y--) {
        a = this.lsl(a);
        if (this.carry) b++;
      }
      b = this.lsr(b);
      this.state[0] = this.rol(this.state[0]);
      this.state[1] = this.rol(this.state[1]);
      this.state[2] = this.rol(this.state[2]);
    }
    return this.state[0];
  }

  spin(count) {
    for (let i = 0; i < count; i++) this.random();
  }
}