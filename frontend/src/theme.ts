import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#b63825', contrastText: '#fff9ec' },
    secondary: { main: '#282826' },
    background: { default: '#f5f2e9', paper: '#fbf8f0' },
    divider: '#ded8cb',
    text: { primary: '#232622', secondary: '#625f53' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Golos Text Variable", system-ui, sans-serif',
    button: { textTransform: 'none', fontWeight: 650 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 42, letterSpacing: '-0.01em' } },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiOutlinedInput: { styleOverrides: { notchedOutline: { borderColor: '#d1cbbf' } } },
    MuiTooltip: { defaultProps: { enterDelay: 350 } },
  },
});
