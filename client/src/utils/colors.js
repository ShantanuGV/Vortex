// Distinct, harmonious avatar colors curated for Vortex (Deep Slate & Bone White)
export const PARTICIPANT_PALETTE = [
  '#4E6E5D', // Moss Sage
  '#5C6B73', // Slate Blue-Grey
  '#8B5D5D', // Muted Terracotta
  '#5D637E', // Dusk Indigo
  '#6D7952', // Olive Earth
  '#7A5868', // Deep Mauve
  '#4F6D7A', // Nordic Teal
  '#7E6252', // Warm Umber
  '#546A61', // Forest Pine
  '#6C5F70', // Heather Quartz
  '#7A6854', // Golden Clay
  '#486872'  // Ocean Slate
];

export function getParticipantColor(nameOrId) {
  if (!nameOrId) return PARTICIPANT_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < nameOrId.length; i++) {
    hash = (nameOrId.charCodeAt(i) * 31 + (hash << 5) - hash) | 0;
  }
  const index = Math.abs(hash) % PARTICIPANT_PALETTE.length;
  return PARTICIPANT_PALETTE[index];
}

