// Money is stored and calculated in kobo (integers); convert only for display.
const toNaira = (kobo) => Math.round(kobo) / 100;

module.exports = { toNaira };
