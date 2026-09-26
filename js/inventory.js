'use strict';
// Inventory containers (stacks with counts / durability) and the recipe-list crafting system.
MC.Inventory = class {
  constructor(n) { this.slots = new Array(n).fill(null); }
  get size() { return this.slots.length; }
  // add a stack; returns the count that did not fit. order: slot indices to try (default hotbar first)
  add(stack, order) {
    if (!stack || !stack.id) return 0;
    let left = stack.count;
    const max = MC.maxStack(stack.id);
    const idx = order || [...this.slots.keys()];
    if (stack.dur === undefined || max > 1) {
      for (const i of idx) {
        const s = this.slots[i];
        if (!s || s.id !== stack.id || s.count >= max || s.dur !== stack.dur) continue;
        const n = Math.min(left, max - s.count);
        s.count += n; left -= n;
        if (!left) return 0;
      }
    }
    for (const i of idx) {
      if (this.slots[i]) continue;
      const n = Math.min(left, max);
      this.slots[i] = Object.assign({}, stack, { count: n });
      left -= n;
      if (!left) return 0;
    }
    return left;
  }
  count(match) {
    let n = 0;
    for (const s of this.slots) if (s && match(s.id)) n += s.count;
    return n;
  }
  remove(match, n) {
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || !match(s.id)) continue;
      const k = Math.min(left, s.count);
      s.count -= k; left -= k;
      if (s.count <= 0) this.slots[i] = null;
    }
    return n - left;
  }
  clear() { this.slots.fill(null); }
  serialize() { return this.slots.map((s) => (s ? [s.id, s.count, s.dur === undefined ? -1 : s.dur] : null)); }
  load(arr) {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < this.slots.length && i < arr.length; i++) {
      const a = arr[i];
      if (!a || !a[0] || (a[0] < MC.ITEM_BASE ? !MC.BLOCKS[a[0]] : !MC.ITEMS[a[0]])) { this.slots[i] = null; continue; }
      this.slots[i] = { id: a[0], count: a[1] };
      if (a[2] >= 0) this.slots[i].dur = a[2];
    }
  }
};

MC.Crafting = {
  matcher(key) {
    if (key[0] === '#') {
      const ids = MC.GROUPS[key.slice(1)].map((k) => MC.idOf(k));
      return (id) => ids.includes(id);
    }
    const id = MC.idOf(key);
    return (x) => x === id;
  },
  ingName(key) { return key[0] === '#' ? MC.GROUP_NAMES[key.slice(1)] : MC.itemName(MC.idOf(key)); },
  ingIcon(key) { return key[0] === '#' ? MC.idOf(MC.GROUPS[key.slice(1)][0]) : MC.idOf(key); },
  fuelUnits(player) {
    let u = player.fuel;
    for (const s of player.inv.slots) if (s) u += MC.fuelOf(s.id) * s.count;
    return u;
  },
  // what is missing for a recipe (null = can craft)
  check(player, r, near) {
    if (player.creative) return null;
    if (r.station === 'table' && !near.table) return 'table';
    if (r.station === 'furnace' && !near.furnace) return 'furnace';
    for (const [key, n] of r.in) if (player.inv.count(this.matcher(key)) < n) return 'items';
    if (r.station === 'furnace' && this.fuelUnits(player) < 1) return 'fuel';
    return null;
  },
  craft(player, r, near) {
    if (this.check(player, r, near)) return false;
    const inv = player.inv;
    if (!player.creative) {
      for (const [key, n] of r.in) inv.remove(this.matcher(key), n);
      if (r.station === 'furnace') {
        if (player.fuel < 1) {
          // burn the cheapest fuel item available
          let best = -1, bu = Infinity;
          inv.slots.forEach((s, i) => { if (s) { const u = MC.fuelOf(s.id); if (u > 0 && u < bu) { bu = u; best = i; } } });
          if (best >= 0) {
            const s = inv.slots[best];
            player.fuel += bu;
            s.count--;
            if (s.id === MC.ITEM.lava_bucket) inv.slots[best] = MC.makeStack(MC.ITEM.bucket);
            else if (s.count <= 0) inv.slots[best] = null;
          }
        }
        player.fuel = Math.max(0, player.fuel - 1);
      }
    }
    const out = MC.makeStack(MC.idOf(r.out[0]), r.out[1]);
    const left = inv.add(out);
    if (left > 0) player.dropStack(Object.assign({}, out, { count: left }));
    return true;
  },
};
