import './PlayerWatermark.css';

/** Keep inside the fullscreen container, independently of fading controls. */
export default function PlayerWatermark({ active = false }: { active?: boolean }) {
  return (
    <div className="kp-player-watermark" data-active={active} aria-hidden="true">
      <img src="/brand/khophim-favicon-v2-96.png" alt="" width="96" height="96" draggable={false} />
      <span>KhoPhim<span className="kp-player-watermark-domain">.org</span></span>
    </div>
  );
}
