import {
  defaultTheme,
  // @ts-ignore
  ThemeProvider as UntypedProvider
} from 'evergreen-ui'

const theme = { ...defaultTheme }
// ThemeProvider is not in the index.d.ts for evergreen
const ThemeProvider = UntypedProvider as React.Provider<typeof defaultTheme>

export { theme, ThemeProvider }
 
