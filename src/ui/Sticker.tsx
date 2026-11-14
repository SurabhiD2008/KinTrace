import type { ReactNode } from 'react';
import './Sticker.css';

/** The three finding statuses, plus unknown and a plain label. Never a score. */
export type StickerStatus = 'meets' | 'discuss' | 'none' | 'unknown' | 'neutral';

export interface StickerProps {
  status?: StickerStatus;
  children: ReactNode;
}

export function Sticker({ status = 'neutral', children }: StickerProps) {
  return (
    <span className={`kt-sticker kt-sticker--${status}`} data-status={status}>
      {children}
    </span>
  );
}
