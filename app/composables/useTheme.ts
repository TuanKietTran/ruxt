export type ThemeId = 'mocha' | 'latte' | 'opencode'

export const THEMES: { id: ThemeId; label: string; dark: boolean }[] = [
  { id: 'mocha',    label: 'Catppuccin Mocha',  dark: true  },
  { id: 'latte',    label: 'Catppuccin Latte',  dark: false },
  { id: 'opencode', label: 'OpenCode',           dark: true  },
]

export function useTheme() {
  const current = useState<ThemeId>('theme', () => 'mocha')

  const apply = (id: ThemeId) => {
    current.value = id
    if (import.meta.client) {
      document.documentElement.setAttribute('data-theme', id)
      localStorage.setItem('theme', id)
    }
  }

  const init = () => {
    if (import.meta.client) {
      const stored = localStorage.getItem('theme') as ThemeId | null
      apply(stored ?? 'mocha')
    }
  }

  return { current: readonly(current), themes: THEMES, apply, init }
}
