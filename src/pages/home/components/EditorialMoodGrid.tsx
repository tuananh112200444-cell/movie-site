import { Link } from 'react-router-dom';

interface EditorialMoodGridProps {
  onOpenQueer: () => void;
}

const MOODS = [
  { index: '01', title: 'Muốn cười một chút', note: 'Hài hước · Nhẹ nhàng', href: '/the-loai/hai-huoc', tone: 'amber' },
  { index: '02', title: 'Một tối lãng mạn', note: 'Tình cảm · Thanh xuân', href: '/the-loai/tinh-cam', tone: 'rose' },
  { index: '03', title: 'Căng thẳng đến phút cuối', note: 'Kinh dị · Bí ẩn', href: '/the-loai/kinh-di', tone: 'violet' },
  { index: '04', title: 'Đi đến thế giới khác', note: 'Viễn tưởng · Phiêu lưu', href: '/the-loai/vien-tuong', tone: 'sky' },
  { index: '05', title: 'Xem cùng gia đình', note: 'Ấm áp · Dễ xem', href: '/the-loai/gia-dinh', tone: 'emerald' },
] as const;

export default function EditorialMoodGrid({ onOpenQueer }: EditorialMoodGridProps) {
  return (
    <section className="editorial-mood-section" aria-labelledby="editorial-mood-title">
      <header>
        <p className="editorial-eyebrow">Không biết xem gì?</p>
        <h2 id="editorial-mood-title">Chọn phim theo tâm trạng</h2>
      </header>

      <div className="editorial-mood-grid">
        {MOODS.map((mood) => (
          <Link key={mood.index} to={mood.href} className={`editorial-mood-card is-${mood.tone}`}>
            <span className="editorial-mood-index">{mood.index}</span>
            <span className="editorial-mood-title">{mood.title}</span>
            <span className="editorial-mood-note">{mood.note}</span>
            <i className="ri-arrow-right-up-line" aria-hidden="true" />
          </Link>
        ))}
        <button type="button" onClick={onOpenQueer} className="editorial-mood-card is-cyan">
          <span className="editorial-mood-index">06</span>
          <span className="editorial-mood-title">Vũ trụ đam mỹ</span>
          <span className="editorial-mood-note">BL · GL · Bách hợp</span>
          <i className="ri-arrow-right-up-line" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
