import type { ActorInfo } from '@/mocks/actors';

interface ActorSEOContentProps {
  actor: ActorInfo;
}

export default function ActorSEOContent({ actor }: ActorSEOContentProps) {
  return (
    <section className="mt-10 bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-6">
      <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-red-500 rounded-full flex-shrink-0" />
        Xem Phim {actor.name} Vietsub Miễn Phí Tại KhoPhim
      </h3>

      <div className="prose prose-sm max-w-none text-white/55 leading-relaxed space-y-3">
        <p>
          <strong className="text-white/75">KhoPhim</strong> là nơi tổng hợp đầy đủ nhất các bộ phim của{' '}
          <strong className="text-white/75">{actor.name}</strong> với chất lượng HD vietsub miễn phí.
          Từ những bộ phim đầu tay cho đến các tác phẩm mới nhất, tất cả đều được cập nhật nhanh chóng
          và đầy đủ tại KhoPhim.
        </p>

        <p>
          Các bộ phim nổi tiếng của <strong className="text-white/75">{actor.name}</strong> như{' '}
          <strong className="text-white/75">{actor.knownFor.slice(0, 3).join(', ')}</strong> đều có thể
          xem trực tuyến miễn phí với phụ đề tiếng Việt chất lượng cao. Không cần đăng ký tài khoản,
          không quảng cáo phiền phức.
        </p>

        <p>
          Ngoài phim của <strong className="text-white/75">{actor.name}</strong>, KhoPhim còn cung cấp
          hàng nghìn bộ phim Hàn Quốc, Trung Quốc, Âu Mỹ và Việt Nam với vietsub HD. Cập nhật hàng ngày,
          đảm bảo bạn không bỏ lỡ bất kỳ bộ phim hay nào.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 not-prose">
          {[
            { icon: 'ri-hd-line', label: 'Chất lượng HD' },
            { icon: 'ri-translate-2', label: 'Vietsub đầy đủ' },
            { icon: 'ri-shield-check-line', label: 'Miễn phí 100%' },
            { icon: 'ri-speed-line', label: 'Tốc độ cao' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2.5">
              <i className={`${item.icon} text-red-400 text-sm flex-shrink-0`} />
              <span className="text-xs text-white/60">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
