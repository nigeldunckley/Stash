import type * as Stitches from '@stitches/react'
import { createStitches, createTheme } from '@stitches/react'

export enum ThemeId {
  Light = 'Light',
  Dark = 'Dark',
  Sepia = 'Sepia',
  Apollo = 'Apollo',
  Black = 'Black',
  System = 'System',
}

export const { styled, css, theme, getCssText, globalCss, keyframes, config } =
  createStitches({
    utils: {
      bg: (value: Stitches.PropertyValue<'backgroundColor'>) => ({
        backgroundColor: value,
      }),
      p: (value: Stitches.PropertyValue<'padding'>) => ({
        padding: value,
      }),
      pt: (value: Stitches.PropertyValue<'paddingTop'>) => ({
        paddingTop: value,
      }),
      pb: (value: Stitches.PropertyValue<'paddingBottom'>) => ({
        paddingBottom: value,
      }),
      pl: (value: Stitches.PropertyValue<'paddingLeft'>) => ({
        paddingLeft: value,
      }),
      pr: (value: Stitches.PropertyValue<'paddingRight'>) => ({
        paddingRight: value,
      }),
      px: (value: Stitches.PropertyValue<'padding'>) => ({
        paddingLeft: value,
        paddingRight: value,
      }),
      py: (value: Stitches.PropertyValue<'padding'>) => ({
        paddingTop: value,
        paddingBottom: value,
      }),
      m: (value: Stitches.PropertyValue<'margin'>) => ({
        margin: value,
      }),
      mt: (value: Stitches.PropertyValue<'marginTop'>) => ({
        marginTop: value,
      }),
      mb: (value: Stitches.PropertyValue<'marginBottom'>) => ({
        marginBottom: value,
      }),
      ml: (value: Stitches.PropertyValue<'marginLeft'>) => ({
        marginLeft: value,
      }),
      mr: (value: Stitches.PropertyValue<'marginRight'>) => ({
        marginRight: value,
      }),
      mx: (value: Stitches.PropertyValue<'margin'>) => ({
        marginLeft: value,
        marginRight: value,
      }),
      my: (value: Stitches.PropertyValue<'margin'>) => ({
        marginTop: value,
        marginBottom: value,
      }),
    },
    theme: {
      fonts: {
        inter: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
        display: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
        mono: "'Geist Mono', ui-monospace, SFMono-Regular, monospace",
        serif: "'Newsreader', Georgia, serif",
      },
      fontSizes: {
        1: '0.75em',
        2: '0.875em',
        3: '1em',
        4: '1.25em',
        5: '1.5em',
        6: '2em',
        // Stash type scale, fixed pixel sizes for the redesigned screens
        micro: '11px',
        caption: '12px',
        small: '13px',
        body: '14px',
        ui: '15px',
        title: '20px',
        headline: '28px',
        display: '40px',
      },
      space: {
        1: '0.25em',
        2: '0.5em',
        3: '1em',
        4: '2em',
        5: '4em',
        6: '8em',
      },
      sizes: {
        1: '0.25em',
        2: '0.5em',
        3: '1em',
        4: '2em',
        5: '4em',
        6: '8em',
      },
      radii: {
        1: '0.25em',
        2: '0.5em',
        3: '0.75em',
        round: '9999px',
        sm: '6px',
        md: '10px',
        lg: '14px',
      },
      fontWeights: {},
      lineHeights: {},
      letterSpacings: {},
      borderWidths: {},
      borderStyles: {},
      shadows: {
        // cardBoxShadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.05);',
        cardBoxShadow:
          '0px 1px 2px rgba(9, 9, 11, 0.04), 0px 12px 32px -12px rgba(9, 9, 11, 0.14);',
      },
      zIndices: {},
      transitions: {},

      colorScheme: {
        colorScheme: 'light',
      },

      colors: {
        grayBase: '#F4F4F5',
        grayBg: '#FFFFFF',
        grayBgActive: '#E4E4E7',
        grayBorder: '#E4E4E7',
        grayTextContrast: '#18181B',
        graySolid: '#A1A1AA',
        utilityTextDefault: '#27272A',
        utilityTextSubtle: 'rgba(255, 255, 255, 0.65)',
        textNonessential: 'rgba(9, 9, 11, 0.4)',

        grayBgSubtle: '#FAFAFA',
        grayBgHover: '#F4F4F5',
        grayLine: '#E4E4E7',
        grayBorderHover: '#D4D4D8',
        grayText: '#71717A',

        ctaBlue: '#FF4F00',
        modalBackground: '#FFFFFF',

        highlightBackground: '255, 79, 0',
        recommendedHighlightBackground: '#E5FFE5',
        highlight: '#FF4F00',
        highlightText: '#3D3D3D',
        error: '#FA5E4A',

        discover: '#7274d5',

        // Brand Colors
        omnivoreRed: '#FF4F00',
        omnivoreGray: '#3D3D3D',
        omnivoreYellow: '#FFE4D6',
        omnivoreLightGray: 'rgb(125, 125, 125)',
        omnivoreCtaYellow: 'rgb(255, 79, 0)',
        searchActiveOutline: 'rgb(255, 79, 0)',

        // Reader Colors
        readerBg: '#FFFFFF',
        readerFont: '#27272A',
        readerFontHighContrast: '#09090B',
        readerTableHeader: '#FFFFFF',
        readerMargin: 'white',
        readerTextSubtle: '#71717A',

        // Avatar Fallback color
        avatarBg: '#FFE4D6',
        avatarFont: '#C23A00',

        labelButtonsBg: '#F4F4F5',

        textSubtle: '#52525B',
        border: '#E4E4E7',

        //utility
        overlay: 'rgba(9, 9, 11, 0.32)',

        // New theme, special naming to keep things straight
        // once all switch over, we will rename
        thBackground: '#FFFFFF',
        thBackground2: '#F4F4F5',
        thBackground3: '#FAFAFA',
        thBackground4: '#F4F4F5',
        thBackground5: '#F4F4F5',
        thBackgroundActive: '#FFE4D6',
        thBackgroundContrast: '#FFFFFF',
        thLeftMenuBackground: '#FFFFFF',
        thNavMenuFooter: '#F4F4F5',
        thLibraryBackground: '#FAFAFA',
        thLibrarySearchbox: '#FFFFFF',
        thLibraryMenuPrimary: '#09090B',
        thLibraryMenuSecondary: '#09090B',
        thLibraryMenuUnselected: '#3F3F46',
        thLibrarySelectionColor: '#F4F4F5',
        thLibraryNavigationMenuFooter: '#F4F4F5',
        thLibraryMenuFooterHover: '#FFFFFF',
        thLibraryMultiselectHover: '#E4E4E7',
        thLibraryMultiselectCheckbox: '#09090B',
        thLibraryMultiselectCheckboxHover: '#09090B',

        thTLDRText: '#3F3F46',

        thFormInput: '#F4F4F5',
        thHomeIcon: '#09090B',

        thLabelChipForeground: '#27272A',
        thLabelChipBackground: '#F4F4F5',
        thLabelChipSelectedBorder: '#09090B',
        thLabelChipUnselectedBorder: '#F4F4F5',
        thLabelOutlineChipBorder: '#E4E4E7',

        thHeaderIconRing: '#E4E4E7',
        thHeaderIconInner: '#71717A',

        thNotebookSubtle: '#71717A',
        thNotebookBorder: '#E4E4E7',
        thNotebookBackground: '#FAFAFA',
        thNotebookTextBackground: '#F4F4F5',

        thTextContrast: '#09090B',
        thTextContrast2: '#27272A',

        thTextSubtle: '#18181B',
        thTextSubtle2: '#71717A',
        thTextSubtle3: '#A1A1AA',
        thTextSubtle4: '#E4E4E7',

        thBorderColor: '#E4E4E7',
        thBorderSubtle: '#F4F4F5',
        tabTextUnselected: '#71717A',

        thProgressFg: '#FF4F00',

        thHighContrast: '#18181B',
        thHighlightBar: '#E4E4E7',

        homeCardHover: '#FAFAFA',
        homeTextTitle: '#09090B',
        homeTextSource: '#3F3F46',
        homeTextBody: '#3F3F46',
        homeTextSubtle: '#71717A',
        homeActionIcons: '#71717A',
        homeActionHoverBg: '#E4E4E7',
        homeDivider: '#E4E4E7',

        backgroundMedium: '#FFFFFF',

        thLibraryAISummaryBorder: '#6A6968',
        thLibraryAISummaryBackground: '#343434',

        thFallbackImageForeground: '#3F3F46',
        thFallbackImageBackground: '#F4F4F5',

        // Stash palette for the redesigned screens
        stCanvas: '#FAFAFA',
        stSurface: '#FFFFFF',
        stSunken: '#F4F4F5',
        stLine: '#E4E4E7',
        stLineStrong: '#D4D4D8',
        stInk: '#09090B',
        stInk2: '#3F3F46',
        stMuted: '#71717A',
        stAccent: '#FF4F00',
        stAccentText: '#C23A00',
        stAccentTint: 'rgba(255, 79, 0, 0.10)',
        stOnAccent: '#09090B',

        highlight_background_green: '85, 198, 137',
        highlight_background_blue: '106, 177, 255',
        highlight_background_orange: '255, 79, 0',
        highlight_background_yellow: '255, 210, 52',
        highlight_background_red: '251, 154, 154',

        highlight_background_alpha: '0.2',
        highlight_underline_alpha: '1.0',
      },
    },
    media: {
      xsmDown: '(max-width: 375px)',
      smDown: '(max-width: 575px)',
      mdDown: '(max-width: 768px)',
      lgDown: '(max-width: 992px)',
      xlgDown: '(max-width: 1200px)',
      sm: '(min-width: 576px)',
      md: '(min-width: 768px)',
      lg: '(min-width: 992px)',
      xl: '(min-width: 1200px)',
      xxl: '(min-width: 1500px)',
    },
  })

const darkThemeSpec = {
  colorScheme: {
    colorScheme: 'dark',
  },
  shadows: {
    cardBoxShadow: '0px 12px 32px -8px rgba(0, 0, 0, 0.6);',
  },
  colors: {
    grayBase: '#09090B',
    grayBg: '#18181B',
    grayBgActive: '#27272A',
    grayTextContrast: '#E4E4E7',
    grayBorder: '#27272A',
    graySolid: '#9C9B9A',
    utilityTextDefault: '#D4D4D8',
    textNonessential: 'rgba(161, 161, 170, 0.8)',

    grayBgSubtle: '#111113',
    grayBgHover: '#1F1F23',
    grayLine: '#27272A',
    grayBorderHover: '#3F3F46',
    grayText: '#D4D4D8',

    modalBackground: '#18181B',

    // Semantic Colors
    highlightBackground: '255, 110, 40',
    recommendedHighlightBackground: '#1F4315',
    highlight: '#FF4F00',
    highlightText: 'white',
    error: '#FA5E4A',

    // Reader Colors
    readerBg: '#111113',
    readerFont: '#D4D4D8',
    readerFontHighContrast: '#FAFAFA',
    readerTableHeader: '#FFFFFF',
    readerMargin: '#111113',
    readerTextSubtle: '#A1A1AA',

    avatarBg: '#3A1A0A',
    avatarFont: '#FFB08A',

    textSubtle: '#A1A1AA',
    border: '#27272A',

    //utility
    utilityTextSubtle: 'rgba(255, 255, 255, 0.65)',
    overlay: 'rgba(0, 0, 0, 0.6)',

    labelButtonsBg: '#27272A',

    // New theme, special naming to keep things straight
    // once all switch over, we will rename
    // DARK
    colorScheme: 'dark',
    thBackground: '#111113',
    thBackground2: '#1F1F23',
    thBackground3: '#0E0E10',
    thBackground4: '#1F1F23',
    thBackground5: '#27272A',
    thBackgroundActive: '#27272A',
    thBackgroundContrast: '#000000',
    thLeftMenuBackground: '#18181B',
    thNavMenuFooter: '#27272A',
    thLibraryBackground: '#09090B',
    thLibrarySearchbox: '#18181B',
    thLibraryMenuPrimary: '#FAFAFA',
    thLibraryMenuSecondary: '#FAFAFA',
    thLibraryMenuUnselected: '#D4D4D8',
    thLibrarySelectionColor: '#27272A',
    thLibraryNavigationMenuFooter: '#1F1F23',
    thLibraryMenuFooterHover: '#3F3F46',
    thLibraryMultiselectHover: '#3F3F46',
    thLibraryMultiselectCheckbox: 'white',
    thLibraryMultiselectCheckboxHover: 'white',

    thTLDRText: '#D4D4D8',

    searchActiveOutline: '#FF4F00',
    thFormInput: '#1F1F23',
    thHomeIcon: '#FAFAFA',

    thLabelChipForeground: '#E4E4E7',
    thLabelChipBackground: '#27272A',
    thLabelChipSelectedBorder: '#FF4F00',
    thLabelChipUnselectedBorder: '#18181B',
    thLabelOutlineChipBorder: '#3F3F46',

    thHeaderIconRing: '#27272A',
    thHeaderIconInner: '#D4D4D8',

    thNotebookSubtle: '#A1A1AA',
    thNotebookBorder: '#27272A',
    thNotebookBackground: '#18181B',
    thNotebookTextBackground: '#27272A',
    thNotebookHighContrast: '#111113',

    thTextContrast: '#FAFAFA',
    thTextContrast2: '#E4E4E7',

    thTextSubtle: '#D4D4D8',
    thTextSubtle2: '#A1A1AA',
    thTextSubtle3: '#71717A',

    thBorderColor: '#27272A',
    thBorderSubtle: '#3F3F46',
    tabTextUnselected: '#71717A',

    thProgressFg: '#FF4F00',

    thHighContrast: '#E4E4E7',

    thHighlightBar: '#3F3F46',

    homeCardHover: '#18181B',
    homeTextTitle: '#FAFAFA',
    homeTextSource: '#D4D4D8',
    homeTextBody: '#D4D4D8',
    homeTextSubtle: '#A1A1AA',
    homeActionIcons: '#A1A1AA',
    homeActionHoverBg: '#27272A',
    homeDivider: '#27272A',

    backgroundMedium: '#18181B',

    thLibraryAISummaryBorder: '#3F3F46',
    thLibraryAISummaryBackground: '#18181B',

    thFallbackImageForeground: '#FAFAFA',
    thFallbackImageBackground: '#27272A',

    stCanvas: '#09090B',
    stSurface: '#111113',
    stSunken: '#18181B',
    stLine: '#27272A',
    stLineStrong: '#3F3F46',
    stInk: '#FAFAFA',
    stInk2: '#D4D4D8',
    stMuted: '#A1A1AA',
    stAccent: '#FF5A14',
    stAccentText: '#FF8A50',
    stAccentTint: 'rgba(255, 90, 20, 0.14)',
    stOnAccent: '#09090B',

    highlight_underline_alpha: '0.5',
    highlight_background_alpha: '0.35',
  },
}

// This is used by iOS
const blackThemeSpec = {
  colors: {
    readerBg: 'black',
  },
}

const apolloThemeSpec = {
  colors: {
    readerBg: '#18181B',
    readerFont: '#E4E4E7',
    readerMargin: '#18181B',
    readerFontHighContrast: 'white',
    readerTableHeader: '#FFFFFF',

    thLeftMenuBackground: '#1F1F23',
    thNavMenuFooter: '#27272A',

    thLibrarySelectionColor: '#27272A',
    thBackground4: '#27272A66', // used on hover of nav menu items
    thBorderColor: '#3F3F46',

    homeCardHover: '#27272A',
    homeDivider: '#3F3F46',
    homeActionHoverBg: '#27272A',

    thBackground: '#18181B',
    thBackground2: '#1F1F23',
    backgroundMedium: '#1F1F23',

    thLibraryMultiselectHover: '#3F3F46',
    thLabelChipBackground: '#3F3F46',

    stCanvas: '#18181B',
    stSurface: '#1F1F23',
    stSunken: '#27272A',
    stLine: '#2E2E33',
    stLineStrong: '#3F3F46',
  },
}

const sepiaThemeSpec = {
  colorScheme: {
    colorScheme: 'light',
  },
  colors: {
    readerBg: '#FDF6E3',
    readerFont: '#5F4B32',
    readerMargin: '#F3F3F3',
    readerFontHighContrast: '#0A0806',
    readerTableHeader: '#FFFFFF',

    thLeftMenuBackground: '#F8F1E0',
    thNavMenuFooter: '#EEE8D5',

    thLibrarySelectionColor: '#EEE8D5',
    thLabelChipBackground: '#EEE8D5',
    thBackground4: '#DDD6C166', // used on hover of menu items
    thBorderColor: '#DDD6C1',

    thBackground: '#FDF6E3',

    homeCardHover: '#EEE8D5',
    backgroundMedium: '#EEE8D5',
    homeDivider: '#DDD6C1',
    homeActionHoverBg: '#DDD6C1',

    thLibraryMultiselectHover: '#EEE8D5',
  },
}

export const darkTheme = createTheme(ThemeId.Dark, darkThemeSpec)
export const sepiaTheme = createTheme(ThemeId.Sepia, {
  ...darkThemeSpec,
  ...sepiaThemeSpec,
})
export const apolloTheme = createTheme(ThemeId.Apollo, {
  ...darkThemeSpec,
  colors: {
    ...darkThemeSpec.colors,
    ...apolloThemeSpec.colors,
  },
})
export const blackTheme = createTheme(ThemeId.Black, {
  ...darkThemeSpec,
  colors: {
    ...darkThemeSpec.colors,
    ...blackThemeSpec.colors,
  },
})

// Apply global styles in here
export const globalStyles = globalCss({
  body: {
    colorScheme: 'var(--colorScheme-colorScheme)',
    backgroundColor: '$readerBg',
  },
  // Room for the iPhone tab bar (MobileTabBar).
  '@media (max-width: 768px)': {
    'body[data-tabbar="on"]': {
      paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
    },
  },
  // browser prefers this loaded here vs in the article styling css
  '.article-inner-css': {
    '::selection': {
      background: 'rgba(var(--colors-highlightBackground), 0.28)',
    },
  },
})
