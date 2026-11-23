const SHORT_ROUND_FORMATS = new Set(['Silver Age', 'Sealed Deck', 'Draft'])

function initialRoundMinutes(game, format) {
  if (game !== 'FAB') return 50
  return SHORT_ROUND_FORMATS.has(format) ? 35 : 55
}

module.exports = { initialRoundMinutes }
