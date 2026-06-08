import { useState } from 'react';
import type { ActorInfo } from '@/mocks/actors';

interface ActorBioProps {
  actor: ActorInfo;
}

export default function ActorBio({ actor }: ActorBioProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-4">
      {/* Bio card */}
      <div className="bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-1 h-3.5 bg-red-500 rounded-full flex-shrink-0" />
          Tiểu Sử
        </h3>

        <div className={`relative overflow-hidden transition-all duration-500 ${expanded ? '' : 'max-h-[110px]'}`}>
          <p className="text-white/55 text-sm leading-relaxed">{actor.bio}</p>
          {!expanded && (
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0d0f1a] to-transparent" />
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer transition-colors"
        >
          {expanded
            ? <><i className="ri-arrow-up-s-line" /> Thu gọn</>
            : <><i className="ri-arrow-down-s-line" /> Xem thêm</>}
        </button>

        {/* Known for */}
        <div className="mt-5 pt-4 border-t border-white/[0.06]">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Nổi Tiếng Với</p>
          <div className="flex flex-wrap gap-1.5">
            {actor.knownFor.map((title) => (
              <span
                key={title}
                className="text-[11px] text-white/60 bg-white/[0.05] border border-white/[0.07] px-2.5 py-1.5 rounded-lg flex items-center gap-1"
              >
                <i className="ri-film-line text-[10px] text-red-400/50" />
                {title}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Quick info */}
      <div className="bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-1 h-3.5 bg-red-500 rounded-full flex-shrink-0" />
          Thông Tin
        </h3>
        <dl className="space-y-2.5">
          {[
            { label: 'Tên đầy đủ', value: actor.nameEn, icon: 'ri-user-line' },
            { label: 'Ngày sinh', value: actor.born, icon: 'ri-cake-line' },
            { label: 'Nơi sinh', value: actor.birthplace, icon: 'ri-map-pin-line' },
            { label: 'Quốc tịch', value: actor.nationality, icon: 'ri-flag-line' },
            ...(actor.height ? [{ label: 'Chiều cao', value: actor.height, icon: 'ri-ruler-line' }] : []),
            ...(actor.agency ? [{ label: 'Công ty', value: actor.agency, icon: 'ri-building-2-line' }] : []),
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-start gap-2.5">
              <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/[0.04] flex-shrink-0 mt-0.5">
                <i className={`${icon} text-white/25 text-xs`} />
              </div>
              <div className="flex-1 min-w-0">
                <dt className="text-[10px] text-white/25 uppercase tracking-wider">{label}</dt>
                <dd className="text-xs text-white/60 mt-0.5">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      {/* Awards */}
      {actor.awards.length > 0 && (
        <div className="bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1 h-3.5 bg-amber-500 rounded-full flex-shrink-0" />
            Giải Thưởng
          </h3>
          <ul className="space-y-3">
            {actor.awards.map((award, i) => (
              <li key={award} className="flex items-start gap-3">
                <div className={`w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5 ${
                  i === 0 ? 'bg-amber-500/20 border border-amber-500/30' :
                  i === 1 ? 'bg-slate-400/20 border border-slate-400/30' :
                  'bg-orange-700/20 border border-orange-700/30'
                }`}>
                  <i className={`ri-award-fill text-[10px] ${
                    i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : 'text-orange-500'
                  }`} />
                </div>
                <span className="text-xs text-white/50 leading-relaxed">{award}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search keywords */}
      <div className="bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-3.5 bg-red-500 rounded-full flex-shrink-0" />
          Từ Khóa Tìm Kiếm
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {actor.searchKeywords.map((kw) => (
            <span
              key={kw}
              className="text-[10px] text-white/35 bg-white/[0.04] border border-white/[0.06] px-2 py-1 rounded-lg"
            >
              {kw}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
