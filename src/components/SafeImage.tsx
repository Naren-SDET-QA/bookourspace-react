import React, { useEffect, useRef, useState } from 'react';
import { isProfileImageStorageSource, isPublicImageStorageSource, isSupabaseStorageSource, resolveResponsiveMediaSource } from '../lib/media/signedStorageUrl';

export type SafeImageCategory = 'pg' | 'classes' | 'venues' | 'services' | 'stays' | 'movies' | 'general';

const fallbackFor: Record<SafeImageCategory, string> = {
  pg: '/assets/fallbacks/pg.svg',
  classes: '/assets/fallbacks/classes.svg',
  venues: '/assets/fallbacks/venues.svg',
  services: '/assets/fallbacks/services.svg',
  stays: '/assets/fallbacks/stays.svg',
  movies: '/assets/fallbacks/movies.svg',
  general: '/assets/fallbacks/general.svg',
};

const localResponsiveSets: Record<string, string> = {
  '/assets/optimized/profile-avatar-256.webp':
    '/assets/optimized/profile-avatar-128.webp 128w, /assets/optimized/profile-avatar-256.webp 256w',
  '/assets/optimized/brand-emblem-512.webp':
    '/assets/optimized/brand-emblem-128.webp 128w, /assets/optimized/brand-emblem-256.webp 256w, /assets/optimized/brand-emblem-512.webp 512w',
};

function unsplashResponsiveSet(source: string): string | undefined {
  try {
    const url = new URL(source, window.location.origin);
    if (url.hostname !== 'images.unsplash.com') return undefined;
    const max = Number(url.searchParams.get('w'));
    if (!Number.isFinite(max) || max < 1) return undefined;
    const widths = [...new Set([320, 480, 640, 960, max].filter((width) => width <= max))];
    if (widths.length === 0) widths.push(max);
    return widths
      .sort((a, b) => a - b)
      .map((width) => {
        const candidate = new URL(url);
        candidate.searchParams.set('w', String(width));
        candidate.searchParams.set('auto', candidate.searchParams.get('auto') || 'format');
        return `${candidate.toString()} ${width}w`;
      })
      .join(', ');
  } catch {
    return undefined;
  }
}

function responsiveSourceSet(source: string): string | undefined {
  return localResponsiveSets[source] || unsplashResponsiveSet(source);
}

export interface SafeImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src?: string | null;
  srcSet?: string;
  category?: SafeImageCategory;
  priority?: boolean;
}

/**
 * Image view that retains the original provider image when it loads, requests
 * smaller Unsplash derivatives for smaller viewports, and falls back once to a
 * local module illustration after an image error. It never retries a failed
 * remote URL in a loop.
 */
export default function SafeImage({
  src,
  srcSet,
  sizes: requestedSizes,
  category = 'general',
  priority = false,
  loading,
  decoding = 'async',
  className = '',
  onLoad,
  onError,
  ...imageProps
}: SafeImageProps) {
  const cleanSource = typeof src === 'string' ? src.trim() : '';
  const localFallback = fallbackFor[category];
  const sizes = requestedSizes || (
    cleanSource.includes('profile-avatar-')
      ? '128px'
      : cleanSource.includes('brand-emblem-')
        ? '256px'
        : '(max-width: 640px) 92vw, (max-width: 1024px) 48vw, 32vw'
  );
  const resetKey = `${cleanSource}\u0000${category}`;
  const previousResetKey = useRef(resetKey);
  const [fallbackStage, setFallbackStage] = useState(cleanSource ? 0 : 1);
  const [loaded, setLoaded] = useState(false);
  const [signedSource, setSignedSource] = useState('');
  const [signedSrcSet, setSignedSrcSet] = useState('');
  const refreshAttempted = useRef(false);
  const sourceKeyRef = useRef(resetKey);
  sourceKeyRef.current = resetKey;

  useEffect(() => {
    if (!isSupabaseStorageSource(cleanSource)) {
      setSignedSource('');
      setSignedSrcSet('');
      return;
    }
    setSignedSource('');
    setSignedSrcSet('');
    if (!isPublicImageStorageSource(cleanSource) && !isProfileImageStorageSource(cleanSource)) {
      setFallbackStage(1);
      return;
    }
    let disposed = false;
    void resolveResponsiveMediaSource(cleanSource)
      .then((resolved) => {
        if (!disposed && sourceKeyRef.current === resetKey) {
          setSignedSource(resolved.src);
          setSignedSrcSet(resolved.srcSet || '');
        }
      })
      .catch(() => { if (!disposed && sourceKeyRef.current === resetKey) setFallbackStage(1); });
    return () => { disposed = true; };
  }, [cleanSource, resetKey]);

  useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    setFallbackStage(cleanSource ? 0 : 1);
    setLoaded(false);
    setSignedSource('');
    setSignedSrcSet('');
    refreshAttempted.current = false;
  }, [cleanSource, localFallback, resetKey]);

  const storageSource = isSupabaseStorageSource(cleanSource);
  const resolvedSource = fallbackStage === 0
    ? storageSource ? signedSource || localFallback : cleanSource
    : fallbackStage === 1
      ? localFallback
      : fallbackFor.general;
  const resolvedSrcSet = fallbackStage === 0
    ? storageSource
      ? signedSrcSet || undefined
      : srcSet || responsiveSourceSet(cleanSource)
    : undefined;
  // A parent error handler can hide the element or retry a failed remote URL.
  // SafeImage owns bounded fallback handling so those legacy handlers are not invoked.
  void onError;

  return (
    <img
      {...imageProps}
      src={resolvedSource}
      srcSet={resolvedSrcSet}
      sizes={sizes}
      loading={priority ? 'eager' : loading || 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={decoding}
      data-safe-image="true"
      data-image-state={loaded ? 'loaded' : 'loading'}
      className={`${className} ${loaded ? '' : 'animate-pulse bg-gradient-to-br from-indigo-100 via-white to-amber-100'}`.trim()}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      onError={() => {
        setLoaded(false);
        if (storageSource && (isPublicImageStorageSource(cleanSource) || isProfileImageStorageSource(cleanSource)) && !refreshAttempted.current) {
          refreshAttempted.current = true;
          void resolveResponsiveMediaSource(cleanSource, true)
            .then((resolved) => {
              if (sourceKeyRef.current === resetKey) {
                setSignedSource(resolved.src);
                setSignedSrcSet(resolved.srcSet || '');
                setFallbackStage(0);
              }
            })
            .catch(() => { if (sourceKeyRef.current === resetKey) setFallbackStage(1); });
          return;
        }
        setFallbackStage((stage) => (stage === 0 ? 1 : 2));
      }}
    />
  );
}

export function imageCategoryFor(value: unknown): SafeImageCategory {
  const text = String(value || '').toLowerCase();
  if (/pg|hostel|accommod|co-living/.test(text)) return 'pg';
  if (/class|course|batch|train|faculty|education/.test(text)) return 'classes';
  if (/venue|hall|mandap|function|marriage/.test(text)) return 'venues';
  if (/service|repair|helper|electric|plumb|clean|salon/.test(text)) return 'services';
  if (/stay|hotel|resort|property|room|homestay/.test(text)) return 'stays';
  if (/movie|cinema|film|poster/.test(text)) return 'movies';
  return 'general';
}
