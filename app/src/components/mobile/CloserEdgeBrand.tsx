/**
 * CloserEdgeBrand — the CloserEdge AI brand mark and wordmark.
 *
 * The mark is the paper-plane chevron from the marketing site
 * (closeredgeai/logos/closeredge-logo-final.html), reproduced as inline SVG
 * so it scales crisply at any size and needs no asset pipeline.
 *
 * Gradient ids are namespaced via useId so multiple instances can coexist
 * on one screen without def collisions.
 */
import { type FC, useId } from 'react';

interface MarkProps {
  /** Rendered width in px. Height follows the 80:70 aspect ratio. */
  size?: number;
  className?: string;
}

export const CloserEdgeMark: FC<MarkProps> = ({ size = 28, className }) => {
  const uid = useId();
  const a1 = `ce-a1-${uid}`;
  const a2 = `ce-a2-${uid}`;
  const a3 = `ce-a3-${uid}`;
  return (
    <svg
      width={size}
      height={(size * 70) / 80}
      viewBox="0 0 80 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}>
      <defs>
        <linearGradient id={a1} x1="0" y1="10" x2="70" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4A3DC9" />
          <stop offset="100%" stopColor="#9B8FFF" />
        </linearGradient>
        <linearGradient id={a2} x1="0" y1="60" x2="70" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3D32B0" />
          <stop offset="100%" stopColor="#7B6EF6" />
        </linearGradient>
        <linearGradient id={a3} x1="15" y1="20" x2="70" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9B8FFF" stopOpacity=".6" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity=".9" />
        </linearGradient>
      </defs>
      <path d="M0 4 L70 35 L22 33 Z" fill={`url(#${a1})`} />
      <path d="M0 66 L70 35 L22 37 Z" fill={`url(#${a2})`} />
      <path d="M10 14 L70 35 L24 34 Z" fill={`url(#${a3})`} opacity=".5" />
      <path d="M58 33 L70 35 L58 37 Z" fill="white" opacity=".7" />
    </svg>
  );
};

interface WordmarkProps {
  /** Tailwind text size utility applied to the wordmark text. */
  textClassName?: string;
  markSize?: number;
  className?: string;
}

/** Mark + "CloserEdge AI" lockup. Inherits text color; "Edge" is brand violet. */
export const CloserEdgeWordmark: FC<WordmarkProps> = ({
  textClassName = 'text-lg',
  markSize = 24,
  className,
}) => (
  <span className={`inline-flex items-center gap-2 select-none ${className ?? ''}`}>
    <CloserEdgeMark size={markSize} />
    <span className={`font-display font-bold tracking-tight ${textClassName}`}>
      Closer
      <span className="text-edge-400">Edge</span>
      <span className="font-medium opacity-80"> AI</span>
    </span>
  </span>
);
