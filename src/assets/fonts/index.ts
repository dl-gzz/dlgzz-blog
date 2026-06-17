const emptyFontClass = {
  className: '',
  variable: '',
};

/**
 * Keep production builds independent from Google Fonts network access.
 *
 * The global CSS defines the actual system font stacks, while this module keeps
 * the same exports expected by the app layout.
 */
export const fontNotoSans = emptyFontClass;
export const fontNotoSerif = emptyFontClass;
export const fontNotoSansMono = emptyFontClass;
export const fontBricolageGrotesque = emptyFontClass;
