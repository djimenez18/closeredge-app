/**
 * BrandWordmark — the full CloserEdge wordmark logo (arrow + "CloserEdge AI").
 *
 * Theme-aware: the white-text variant on dark surfaces, the dark-text variant
 * on light surfaces, so the owner-provided logo is used wherever the brand
 * shows up (dark backgrounds get `closeredge-logo-white.png`). Both PNGs live
 * in `app/public/brand/`. "CloserEdge AI" is a brand name → English alt text.
 */
interface BrandWordmarkProps {
  /** Tailwind sizing/utility classes; default keeps the wordmark compact. */
  className?: string;
}

const BrandWordmark = ({ className = 'h-7 w-auto' }: BrandWordmarkProps) => (
  <>
    <img
      src="/brand/closeredge-logo-white.png"
      alt="CloserEdge AI"
      className={`hidden dark:block ${className}`}
      draggable={false}
    />
    <img
      src="/brand/closeredge-logo.png"
      alt="CloserEdge AI"
      className={`block dark:hidden ${className}`}
      draggable={false}
    />
  </>
);

export default BrandWordmark;
