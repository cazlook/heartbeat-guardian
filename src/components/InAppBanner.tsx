import { useEffect, useRef, useState } from 'react';
import { Calendar, Check } from 'lucide-react';

export interface BannerData {
  id: string;
  kind: 'invite' | 'accepted';
  name: string;
  detail?: string;
}

interface Props {
  banner: BannerData | null;
  onDismiss: () => void;
}

export const InAppBanner = ({ banner, onDismiss }: Props) => {
  const [visible, setVisible] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!banner) {
      setVisible(false);
      return;
    }
    // mount → animate in next frame
    const raf = requestAnimationFrame(() => setVisible(true));
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(onDismiss, 250);
    }, 4000);
    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [banner?.id]);

  if (!banner) return null;

  const handleClose = () => {
    setVisible(false);
    window.setTimeout(onDismiss, 250);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const endY = e.changedTouches[0]?.clientY ?? touchStartY.current;
    if (endY - touchStartY.current < -30) handleClose();
    touchStartY.current = null;
  };

  const text =
    banner.kind === 'invite'
      ? `${banner.name} ti ha invitato${banner.detail ? `: ${banner.detail}` : ''}`
      : `${banner.name} ha accettato il tuo invito 🎉`;

  return (
    <div
      onClick={handleClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="button"
      tabIndex={0}
      style={{
        position: 'fixed',
        top: `calc(env(safe-area-inset-top, 0px) + 8px)`,
        left: 12,
        right: 12,
        zIndex: 100,
        background: '#1a1a1a',
        border: '1px solid #d4a574',
        borderRadius: 12,
        color: '#f0ece4',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 14,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        cursor: 'pointer',
        transform: visible ? 'translateY(0)' : 'translateY(-120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 250ms ease, opacity 250ms ease',
      }}
    >
      {banner.kind === 'invite' ? (
        <Calendar size={18} color="#d4a574" />
      ) : (
        <Check size={18} color="#d4a574" />
      )}
      <span style={{ flex: 1, lineHeight: 1.3 }}>{text}</span>
    </div>
  );
};

export default InAppBanner;
