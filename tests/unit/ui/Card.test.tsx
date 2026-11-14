import { render, screen } from '@testing-library/react';
import { Card } from '../../../src/ui';

describe('Card', () => {
  it('renders its title as a level 2 heading by default, with the content', () => {
    render(
      <Card title="Findings">
        <p>Body text</p>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Findings' })).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('uses the requested heading level', () => {
    render(
      <Card title="Evidence" headingLevel={3}>
        <p>Body text</p>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Evidence' })).toBeInTheDocument();
  });

  it('renders no heading when there is no title', () => {
    render(
      <Card>
        <p>Body text</p>
      </Card>,
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
