import { render, screen } from '@testing-library/react';
import { Sticker } from '../../../src/ui';
import type { StickerStatus } from '../../../src/ui';

describe('Sticker', () => {
  it('defaults to a neutral label', () => {
    render(<Sticker>Maternal side</Sticker>);
    const sticker = screen.getByText('Maternal side');
    expect(sticker).toHaveClass('kt-sticker', 'kt-sticker--neutral');
    expect(sticker).toHaveAttribute('data-status', 'neutral');
  });

  it.each<StickerStatus>(['meets', 'discuss', 'none', 'unknown'])(
    'marks the %s status with its own class and keeps the text label',
    (status) => {
      render(<Sticker status={status}>Label</Sticker>);
      const sticker = screen.getByText('Label');
      expect(sticker).toHaveClass(`kt-sticker--${status}`);
      expect(sticker).toHaveAttribute('data-status', status);
    },
  );
});
