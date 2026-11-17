const formatCurrency = (rawCopper) => {
  const total = Number(rawCopper || 0);
  const gold = Math.floor(total / 4096);
  const remainderAfterGold = total % 4096;
  const silver = Math.floor(remainderAfterGold / 64);
  const copper = remainderAfterGold % 64;

  return {
    raw: total,
    gold,
    silver,
    copper,
    formatted: `${gold} Vàng ${silver} Bạc ${copper} Đồng`,
  };
};

module.exports = { formatCurrency };
