import { useState, useEffect } from 'react';
import type { ActorInfo } from '@/mocks/actors';

interface ActorHeroProps {
  actor: ActorInfo;
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: 'ri-instagram-line',
  twitter: 'ri-twitter-x-line',
  facebook: 'ri-facebook-circle-line',
  youtube: 'ri-youtube-line',
  tiktok: 'ri-tiktok-line',
};

export default function ActorHero({ actor }: ActorHeroProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = actor.coverImage;
    img.onload = () => setImgLoaded(true);
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, [actor.coverImage]);

  const age = actor.born
    ? new Date().getFullYear() - parseInt(actor.born.split('/')[2] ?? '0', 10)
    : null;

  return (
    <section className="relative w-full overflow-hidden" style={{ minHeight: '520px' }}>
      {/* Cover image */}
      <div className="absolute inset-0">
        <div
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          style={{ backgroundImage: `url(${actor.coverImage})` }}
        />
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080a10] via-[#080a10]/65 to-[#080a10]/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#080a10]/85 via-[#080a10]/40 to-transparent" />
        {/* Subtle vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(8,10,16,0.5)_100%)]" />
      </div>

      {/* Content */}
      <div
        className={`relative z-10 max-w-[1760px] mx-auto px-4 flex items-end pb-10 md:pb-14 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        style={{ minHeight: '520px' }}
      >
        <div className="flex flex-col md:flex-row items-start md:items-end gap-6 w-full">

          {/* Avatar with glow */}
          <div className="flex-shrink-0 relative">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-red-500/30 to-transparent blur-md" />
            <div className="relative w-28 h-36 md:w-40 md:h-52 rounded-2xl overflow-hidden border border-white/20">
              <img
                src={actor.image}
                alt={actor.name}
                className="w-full h-full object-cover object-top"
                loading="eager"
              />
            </div>
            {/* Verified badge */}
            <div className="absolute -bottom-2 -right-2 w-8 h-8 flex items-center justify-center bg-red-500 rounded-full border-2 border-[#080a10]">
              <i className="ri-star-fill text-white text-xs" />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] font-bold text-red-400 bg-red-500/15 border border-red-500/30 px-2.5 py-1 rounded-full uppercase tracking-widest">
                Diễn Viên
              </span>
              <span className="text-[10px] text-white/50 bg-white/[0.07] border border-white/10 px-2.5 py-1 rounded-full">
                {actor.nationality}
              </span>
              {actor.agency && (
                <span className="text-[10px] text-white/40 bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 rounded-full hidden sm:inline-flex items-center gap-1">
                  <i className="ri-building-2-line text-[9px]" />
                  {actor.agency}
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-none mb-1">
              {actor.name}
            </h1>
            <p className="text-white/40 text-sm md:text-base mb-4 italic">{actor.nameEn}</p>

            {/* Quick info row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/45 mb-5">
              {actor.born && (
                <span className="flex items-center gap-1.5">
                  <i className="ri-cake-line text-red-400/60 text-xs" />
                  {actor.born}
                  {age && <span className="text-white/25 text-xs">({age} tuổi)</span>}
                </span>
              )}
              {actor.birthplace && (
                <span className="flex items-center gap-1.5">
                  <i className="ri-map-pin-line text-red-400/60 text-xs" />
                  {actor.birthplace}
                </span>
              )}
              {actor.height && (
                <span className="flex items-center gap-1.5">
                  <i className="ri-ruler-line text-red-400/60 text-xs" />
                  {actor.height}
                </span>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-5 mb-5 flex-wrap">
              <div className="text-center">
                <div className="text-xl font-black text-white">{actor.knownFor.length}+</div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider">Phim nổi bật</div>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <div className="text-xl font-black text-white">{actor.awards.length}</div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider">Giải thưởng</div>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <div className="text-xl font-black text-white">{actor.genres.length}</div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider">Thể loại</div>
              </div>
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {actor.genres.map((g) => (
                <span
                  key={g}
                  className="text-[11px] text-white/55 bg-white/[0.07] border border-white/[0.09] px-2.5 py-1 rounded-full"
                >
                  {g}
                </span>
              ))}
            </div>

            {/* Known for chips */}
            <div className="flex flex-wrap gap-1.5">
              {actor.knownFor.slice(0, 3).map((title) => (
                <span
                  key={title}
                  className="flex items-center gap-1 text-[11px] text-red-300/70 bg-red-500/[0.08] border border-red-500/15 px-2.5 py-1 rounded-full"
                >
                  <i className="ri-film-line text-[10px]" />
                  {title}
                </span>
              ))}
            </div>
          </div>

          {/* Social links */}
          {actor.socialLinks.length > 0 && (
            <div className="flex flex-row md:flex-col gap-2 flex-shrink-0">
              {actor.socialLinks.map((s) => {
                const key = s.platform.toLowerCase();
                const icon = PLATFORM_ICONS[key] ?? 'ri-global-line';
                return (
                  <a
                    key={s.platform}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title={s.platform}
                    className="w-10 h-10 flex items-center justify-center bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 hover:border-white/20 rounded-xl text-white/45 hover:text-white transition-all cursor-pointer"
                  >
                    <i className={`${icon} text-base`} />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
