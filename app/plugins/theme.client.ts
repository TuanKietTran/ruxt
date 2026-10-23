import { useTheme } from '~/composables/useTheme'

export default defineNuxtPlugin(() => {
  const { init } = useTheme()
  init()
})
