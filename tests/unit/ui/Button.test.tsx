import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../../../src/ui';

describe('Button', () => {
  it('renders a non-submitting button and reports clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Add relative</Button>);

    const button = screen.getByRole('button', { name: 'Add relative' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('kt-button', 'kt-button--secondary');

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the primary variant and keeps a caller class', () => {
    render(
      <Button variant="primary" className="wide">
        Save
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('kt-button--primary', 'wide');
  });

  it('does not fire clicks when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
