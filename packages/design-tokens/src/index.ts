export const themes={
  "light": {
    "background": "#f4f7f8",
    "surface": "#ffffff",
    "ink": "#142b37",
    "muted": "#526875",
    "line": "#dce7ea",
    "primary": "#087d72",
    "soft": "#e1f2ee",
    "warning": "#795622",
    "warningSurface": "#fffaf0",
    "warningLine": "#f0e3c5",
    "danger": "#991b1b"
  },
  "dark": {
    "background": "#101c24",
    "surface": "#172831",
    "ink": "#e6f1f3",
    "muted": "#a7bbc4",
    "line": "#30434d",
    "primary": "#53d6bd",
    "soft": "#203e3e",
    "warning": "#f4d398",
    "warningSurface": "#372f22",
    "warningLine": "#645135",
    "danger": "#fda4af"
  }
} as const;
export type ThemeMode=keyof typeof themes;
export const severityColors={attention:'#b88a13',warning:'#e16a25',severe:'#c52e39',unknown:'#64748b'} as const;
