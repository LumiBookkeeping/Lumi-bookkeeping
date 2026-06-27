// Stock valuation by FIFO (first in, first out) or AVCO (weighted average cost).
// Movements: { date, qty (+in / -out), unitCost (for inflows) }.
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function valuation(movements, method) {
  const ms = [...movements].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (method === 'fifo') {
    const layers = []; // queue of { qty, unitCost }
    for (const m of ms) {
      const q = Number(m.qty || 0);
      if (q > 0) { layers.push({ qty: q, unitCost: Number(m.unitCost || 0) }); }
      else {
        let out = -q;
        while (out > 0 && layers.length) {
          const l = layers[0];
          if (l.qty <= out) { out -= l.qty; layers.shift(); }
          else { l.qty = round2(l.qty - out); out = 0; }
        }
      }
    }
    const qty = round2(layers.reduce((s, l) => s + l.qty, 0));
    const value = round2(layers.reduce((s, l) => s + l.qty * l.unitCost, 0));
    return { qty, value, avgCost: qty ? round2(value / qty) : 0 };
  }
  // AVCO
  let qty = 0, value = 0;
  for (const m of ms) {
    const q = Number(m.qty || 0);
    if (q > 0) { qty += q; value += q * Number(m.unitCost || 0); }
    else {
      const avg = qty ? value / qty : 0;
      value -= (-q) * avg; qty += q;
    }
  }
  return { qty: round2(qty), value: round2(value), avgCost: qty ? round2(value / qty) : 0 };
}

module.exports = { valuation, round2 };
