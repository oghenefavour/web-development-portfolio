const toNaira = (kobo) => (kobo === null || kobo === undefined ? null : Math.round(kobo) / 100);
const nairaToKobo = (naira) => Math.round(Number(naira) * 100);
module.exports = { toNaira, nairaToKobo };
