export const colors = {
  background: '#EEF2F6',
  surface: '#FFFFFF',
  surfaceSoft: '#F6F8FB',
  surfaceAlt: '#F7F9FC',
  surfaceBlue: '#E6EEFF',

  text: '#121826',
  textMuted: '#475569',
  textSoft: '#7B8794',

  ink: '#121826',
  inkSoft: '#475569',
  inkMuted: '#7B8794',

  primary: '#2F6BFF',
  primaryDark: '#174EA6',
  primarySoft: '#E6EEFF',

  success: '#10B981',
  successSoft: '#E9FBF4',
  mint: '#10B981',
  mintSoft: '#E9FBF4',

  danger: '#F43F5E',
  dangerSoft: '#FFF1F2',
  coral: '#F43F5E',
  coralSoft: '#FFF1F2',

  warning: '#F59E0B',
  warningSoft: '#FFF7E6',
  amber: '#F59E0B',
  amberSoft: '#FFF7E6',

  border: '#DCE3EC',
  line: '#E8EDF3',

  dark: '#111827',
  dark2: '#1E293B',
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 34,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
};

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 4,
  },
  soft: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 4,
  },
  strong: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 8,
  },
  elevated: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 8,
  },
};

export const typography = {
  title: {
    fontSize: 32,
    fontWeight: '900' as const,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: colors.ink,
  },
  h3: {
    fontSize: 17,
    fontWeight: '900' as const,
    color: colors.ink,
  },
  body: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: colors.inkMuted,
  },
};
