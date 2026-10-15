export const colors = {
  purple: '#5B43D6',
  deepPurple: '#38239B',
  lavender: '#8B78F0',
  gold: '#FFC83D',
  background: '#F7F7FC',
  surface: '#FFFFFF',
  lavenderTint: '#EEEAFB',
  border: '#E6E7EF',
  text: '#202033',
  secondary: '#74758A',
  success: '#16865D',
  warning: '#D97706',
  danger: '#DC3545',
  info: '#2474E5',
} as const;

export const spacing = { page: 20, card: 16, section: 24 } as const;
export const radius = { card: 18, button: 14, input: 12, chip: 11 } as const;
export const currencyCode = 'USD';

export const Colors = {
  light: { ...colors, tint: colors.purple, icon: colors.secondary, tabIconDefault: colors.secondary, tabIconSelected: colors.purple },
  dark: { ...colors, text: '#F7F7FC', background: '#151421', surface: '#201F31', border: '#353347', tint: colors.lavender, icon: '#B9B8C9', tabIconDefault: '#B9B8C9', tabIconSelected: colors.lavender },
} as const;
