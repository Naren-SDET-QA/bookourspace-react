import React, { useId } from 'react';

export const BOS_OFFICIAL_LOGO_STATIC = '/assets/brand/bos-logo-lockup.webp';
// The animated overlay uses the same artwork at a responsive 2x size so it
// never pulls the 219 KB print original into the mobile Home critical path.
export const BOS_OFFICIAL_LOGO_ANIMATED = '/assets/brand/bos-logo-lockup-1120-bea9629c0067.webp';

const LOGO_WIDTH = 1560;
const LOGO_HEIGHT = 320;
// Pin silhouette in the supplied 1560 × 320 lockup. The rest of the logo stays still.
const PIN_PATH = 'M259 76 C213 76 179 109 179 151 C179 198 232 249 259 273 C286 249 339 198 339 151 C339 109 305 76 259 76 Z';

type BOSOfficialLogoProps = {
  animated?: boolean;
  alt?: string;
  className?: string;
  loading?: 'eager' | 'lazy';
};

/** Official BookOurSpace lockup. Only its central pin rotates; reduced-motion users see the static mark. */
export default function BOSOfficialLogo({
  animated = false,
  alt = 'BookOurSpace — Find, Book, Enjoy',
  className = '',
  loading = 'lazy',
}: BOSOfficialLogoProps) {
  const id = useId().replace(/:/g, '');
  const clipId = `bos-logo-pin-${id}`;

  return (
    <span className={`bos-official-logo ${className}`} role="img" aria-label={alt}>
      <img
        src={BOS_OFFICIAL_LOGO_STATIC}
        srcSet="/assets/brand/bos-logo-lockup-560-5771e9b215e6.webp 560w, /assets/brand/bos-logo-lockup-1120-bea9629c0067.webp 1120w"
        sizes="(max-width: 622px) 90vw, 560px"
        alt=""
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        loading={loading}
        decoding="async"
        fetchPriority={loading === 'eager' ? 'high' : 'auto'}
      />
      {animated && (
        <svg
          className="bos-official-logo__pin-rotor"
          data-testid="bos-logo-pin-rotor"
          viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <path d={PIN_PATH} />
            </clipPath>
          </defs>
          {/* Clear the stationary pin underneath while retaining its original shadow. */}
          <path d={PIN_PATH} fill="#fff" />
          <g className="bos-official-logo__spin">
            <image className="bos-official-logo__face bos-official-logo__face--front" href={BOS_OFFICIAL_LOGO_ANIMATED} x="0" y="0" width={LOGO_WIDTH} height={LOGO_HEIGHT} clipPath={`url(#${clipId})`} />
            <image className="bos-official-logo__face bos-official-logo__face--back" href={BOS_OFFICIAL_LOGO_ANIMATED} x="0" y="0" width={LOGO_WIDTH} height={LOGO_HEIGHT} clipPath={`url(#${clipId})`} />
          </g>
        </svg>
      )}
    </span>
  );
}
