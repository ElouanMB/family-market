import { MD3DarkTheme } from 'react-native-paper';

// THEME "ONYX PRO" - Minimalisme Extrême
const colors = {
    primary: '#FFFFFF',       // Action principale en Blanc
    onPrimary: '#000000',     // Texte sur action en Noir

    // Backgrounds
    background: '#000000',    // Noir pur
    surface: '#121212',       // Carte très sombre
    surfaceVariant: '#1E1E1E', // Carte légèrement plus claire

    // Accents
    secondary: '#34C759',     // Apple Green (Succès)
    error: '#FF453A',         // Apple Red (Erreur)
    tertiary: '#0A84FF',      // Apple Blue (Info)

    // Text layers
    onBackground: '#FFFFFF',
    onSurface: '#FFFFFF',
    onSurfaceVariant: '#8E8E93', // Gris iOS

    // Borders
    outline: '#2C2C2E',
    outlineVariant: '#3A3A3C',
};

export const theme = {
    ...MD3DarkTheme,
    dark: true,
    colors: {
        ...MD3DarkTheme.colors,
        ...colors,
    },
    roundness: 20, // Coins très arrondis moderne
};

export const spacing = { sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 };


