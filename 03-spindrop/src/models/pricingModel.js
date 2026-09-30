const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');
const settings = require('../config/settings');

async function getPricing() {
  const [garments] = await pool.query('SELECT id, name, group_name, price_kobo FROM garment_types WHERE is_active = 1 ORDER BY id');
  const [options] = await pool.query('SELECT service, code, label, price_kobo FROM service_options ORDER BY id');
  const opt = (service) => options.filter((o) => o.service === service).map((o) => ({ code: o.code, label: o.label, price: toNaira(o.price_kobo) }));
  return {
    laundry: {
      garments: garments.map((g) => ({ id: g.id, name: g.name, group: g.group_name, price: toNaira(g.price_kobo) })),
      pickupDeliveryFee: toNaira(settings.pickupDeliveryFeeKobo),
      expressSurchargePercent: settings.expressSurchargePercent,
    },
    cleaning: { perRoom: opt('cleaning'), maxRooms: settings.maxRooms },
    moving: { sizes: opt('moving') },
  };
}

/**
 * Calculates a quote in kobo. Used both for the live quote in the UI and when saving a booking,
 * so the price a customer sees is always the price that is charged.
 */
async function quote(type, input) {
  if (type === 'laundry') {
    const items = input.items || [];
    if (!items.length) throw new HttpError(400, 'Add at least one garment');
    const ids = items.map((i) => i.garmentTypeId);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Each garment type should appear only once');
    const [rows] = await pool.query('SELECT id, name, price_kobo FROM garment_types WHERE is_active = 1 AND id IN (?)', [ids]);
    if (rows.length !== ids.length) throw new HttpError(400, 'One or more garment types do not exist');
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const lines = items.map((i) => ({
      garmentTypeId: i.garmentTypeId,
      name: byId[i.garmentTypeId].name,
      unitPriceKobo: byId[i.garmentTypeId].price_kobo,
      quantity: i.quantity,
      lineTotalKobo: byId[i.garmentTypeId].price_kobo * i.quantity,
    }));
    const subtotal = lines.reduce((s, l) => s + l.lineTotalKobo, 0);
    const express = input.isExpress ? Math.round((subtotal * settings.expressSurchargePercent) / 100) : 0;
    const fee = express + settings.pickupDeliveryFeeKobo;
    return { lines, subtotalKobo: subtotal, feeKobo: fee, totalKobo: subtotal + fee, expressKobo: express };
  }

  const service = type;
  const [rows] = await pool.query('SELECT code, label, price_kobo FROM service_options WHERE service = ? AND code = ?', [service, input.optionCode]);
  if (!rows.length) throw new HttpError(400, `Unknown ${service} option`);
  const option = rows[0];
  if (type === 'cleaning') {
    const subtotal = option.price_kobo * input.rooms;
    return { option: option.label, rooms: input.rooms, subtotalKobo: subtotal, feeKobo: 0, totalKobo: subtotal };
  }
  return { option: option.label, subtotalKobo: option.price_kobo, feeKobo: 0, totalKobo: option.price_kobo };
}

function formatQuote(q) {
  return {
    ...(q.lines ? { lines: q.lines.map((l) => ({ garmentTypeId: l.garmentTypeId, name: l.name, unitPrice: toNaira(l.unitPriceKobo), quantity: l.quantity, lineTotal: toNaira(l.lineTotalKobo) })) } : {}),
    ...(q.option ? { option: q.option } : {}),
    ...(q.rooms ? { rooms: q.rooms } : {}),
    subtotal: toNaira(q.subtotalKobo),
    ...(q.expressKobo ? { expressSurcharge: toNaira(q.expressKobo) } : {}),
    fees: toNaira(q.feeKobo),
    total: toNaira(q.totalKobo),
  };
}

module.exports = { getPricing, quote, formatQuote };
