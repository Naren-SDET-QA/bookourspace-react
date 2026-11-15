/**
 * Brand palette for the admin console and the provider portal.
 *
 * Class names come from the matching `@theme` block in ./tokens.css
 * (`bg-brand-teal`, `border-brand-border`, …). This module exists for the
 * places that cannot use a class: inline `style` objects, gradients and SVG
 * attributes. Update both files together.
 */
export const BRAND_TOKENS = {
  /** Primary accent. */
  teal: '#12C2A0',
  /** Accent for text on light surfaces, where the primary teal is too light. */
  tealDeep: '#0B8F76',
  /** Pressed / hover accent. */
  tealHover: '#087A66',
  /** Chip and badge fill on light surfaces. */
  tealTint: '#CDEFE7',
  /** Panel fill on light surfaces. */
  tealSoft: '#ECFBF6',
  /** Teal text on navy surfaces, where the deep teal is unreadable. */
  tealLight: '#5FE3CB',
  /** Text colour on a primary-teal fill. */
  ink: '#04241C',
  /** Sidebar and dark surfaces. */
  navy: '#0B1526',
  /** Raised surface on navy (rail hover, gradient mid-stop). */
  navySoft: '#132238',
  /** Page canvas behind white cards. */
  canvas: '#F4F7FB',
  /** Hairline border. */
  border: '#E3E9F2',
  /** Primary call to action on the customer sign-in screen. */
  orange: '#F97316',
  /** Orange text and hover on light surfaces. */
  orangeDeep: '#C2410C',
  /** Coral accent paired with the orange action. */
  coral: '#FB7185',
} as const;

export type BrandTokenName = keyof typeof BRAND_TOKENS;
