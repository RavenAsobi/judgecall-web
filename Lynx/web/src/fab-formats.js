export const FAB_FORMATS = [
  'Classic Constructed',
  'Silver Age',
  'Living Legend',
  'Sealed Deck',
  'Draft',
  'Other',
]

const SHORT_ROUND_FORMATS = new Set(['Silver Age', 'Sealed Deck', 'Draft'])

export function fabRoundMinutes(format) {
  return SHORT_ROUND_FORMATS.has(format) ? 35 : 55
}
