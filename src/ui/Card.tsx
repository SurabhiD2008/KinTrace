import type { ReactNode } from 'react';
import './Card.css';

export interface CardProps {
  /** Optional section title, rendered as a heading that labels the card. */
  title?: string;
  headingLevel?: 2 | 3 | 4;
  children: ReactNode;
}

export function Card({ title, headingLevel = 2, children }: CardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="kt-card">
      {title ? <Heading>{title}</Heading> : null}
      {children}
    </section>
  );
}
