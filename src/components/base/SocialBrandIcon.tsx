export type SocialBrandPlatform = 'facebook' | 'messenger' | 'tiktok';

interface SocialBrandIconProps {
  platform: SocialBrandPlatform;
  className?: string;
}

const TIKTOK_NOTE = 'M15.56 3c.25 1.73 1.23 3.08 2.7 3.75.69.31 1.38.45 2.08.47v3.03a8.2 8.2 0 0 1-4.72-1.5v6.11a5.62 5.62 0 1 1-4.84-5.56v3.07a2.57 2.57 0 1 0 1.8 2.46V3h3.03Z';

export default function SocialBrandIcon({ platform, className = 'h-5 w-5' }: SocialBrandIconProps) {
  if (platform === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path fill="currentColor" d="M13.72 22v-8.18h2.74l.41-3.2h-3.15V8.58c0-.93.26-1.56 1.59-1.56H17V4.16A22.6 22.6 0 0 0 14.54 4c-2.44 0-4.11 1.49-4.11 4.22v2.4H7.67v3.2h2.76V22h3.29Z" />
      </svg>
    );
  }

  if (platform === 'messenger') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path fill="currentColor" d="M12 2C6.48 2 2 6.15 2 11.27c0 2.91 1.45 5.5 3.72 7.2V22l3.4-1.87c.91.26 1.88.4 2.88.4 5.52 0 10-4.15 10-9.26S17.52 2 12 2Zm1.02 12.48-2.54-2.71-4.96 2.71 5.45-5.8 2.61 2.71 4.9-2.71-5.46 5.8Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path fill="#25F4EE" d={TIKTOK_NOTE} transform="translate(-.45 .35)" />
      <path fill="#FE2C55" d={TIKTOK_NOTE} transform="translate(.45 -.25)" />
      <path fill="white" d={TIKTOK_NOTE} />
    </svg>
  );
}
