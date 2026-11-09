import React, { useId } from 'react';
import SafeImage from './SafeImage';

const DEFAULT_EMBLEM = '/assets/optimized/brand-emblem-512.webp';
const LOCATION_PIN = 'M171 19 C132 19 102 48 102 86 C102 122 137 157 171 185 C205 157 241 122 241 86 C241 48 210 19 171 19 Z';

type Props = { src: string; animate?: boolean; className?: string; alt?: string };

/**
 * Shows the original orange location-mark artwork with its India/B artwork
 * held still. Only the orange pin outline is extracted from the same source
 * image and rotated; this avoids the extra circular badge previously placed
 * behind the full emblem.
 */
export default function BOSRotatingLocationSymbol({
  src,
  animate = false,
  className = '',
  alt = 'BookOurSpace location symbol',
}: Props) {
  const id = useId().replace(/:/g, '');
  if (src !== DEFAULT_EMBLEM) {
    return <SafeImage category="general" src={src} alt={alt} className={className} sizes="120px" />;
  }

  return (
    <span className={`bos-location-symbol ${className}`} role="img" aria-label={alt}>
      <svg viewBox="88 10 170 190" aria-hidden="true" focusable="false">
        <defs>
          <mask id={`bos-pin-mask-${id}`} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
            <rect x="0" y="0" width="512" height="240" fill="black" />
            <path d={LOCATION_PIN} fill="none" stroke="white" strokeWidth="12" strokeLinejoin="round" />
          </mask>
        </defs>
        <image href={src} x="0" y="0" width="512" height="240" preserveAspectRatio="none" style={{ mixBlendMode: 'multiply' }} />
        <path d={LOCATION_PIN} fill="none" stroke="white" strokeWidth="15" strokeLinejoin="round" />
        <g className={animate ? 'bos-location-symbol-rotor' : undefined}>
          <image
            href={src}
            x="0"
            y="0"
            width="512"
            height="240"
            preserveAspectRatio="none"
            mask={`url(#bos-pin-mask-${id})`}
            style={{ mixBlendMode: 'multiply' }}
          />
        </g>
      </svg>
    </span>
  );
}
