import type { ReactElement } from 'react';
import type { Sex } from '../../domain';
import { HALF } from './geometry';
import type { LayoutCouple, LayoutDescent } from './layout';

// Drawing pieces shared by the interactive tree and the static one (report, landing page).

/** Square for male, circle for female, diamond for intersex or unknown. */
export function SexSymbol({ sex, half, className }: { sex: Sex; half: number; className: string }): ReactElement {
  if (sex === 'male') {
    return <rect className={className} x={-half} y={-half} width={half * 2} height={half * 2} />;
  }
  if (sex === 'female') return <circle className={className} r={half} />;
  const reach = half * 1.18;
  return (
    <polygon className={className} points={`0,${-reach} ${reach},0 0,${reach} ${-reach},0`} />
  );
}

export function CoupleLine({ couple }: { couple: LayoutCouple }) {
  const straight = couple.adjacent && couple.y1 === couple.y2;
  const offsets = couple.consanguineous ? [-3, 3] : [0];
  const middle = (couple.x1 + couple.x2) / 2;
  const top = Math.min(couple.y1, couple.y2) - HALF - 16;
  return (
    <g className="kt-line">
      {offsets.map((offset) =>
        straight ? (
          <line
            key={offset}
            x1={couple.x1 + HALF}
            y1={couple.y1 + offset}
            x2={couple.x2 - HALF}
            y2={couple.y2 + offset}
          />
        ) : (
          // Someone stands between the two: go over the top of the row.
          <path
            key={offset}
            d={`M${couple.x1},${couple.y1 - HALF} V${top + offset} H${couple.x2} V${couple.y2 - HALF}`}
          />
        ),
      )}
      {couple.status === 'former' && straight ? (
        <path
          d={`M${middle - 7},${couple.y1 + 8} l6,-16 M${middle + 1},${couple.y1 + 8} l6,-16`}
        />
      ) : null}
    </g>
  );
}

export function DescentLine({ descent }: { descent: LayoutDescent }) {
  const xs = [descent.origin.x, ...descent.children.map((child) => child.x)];
  const drops = descent.children.map((child) => `M${child.x},${descent.barY} V${child.y}`).join(' ');
  const d = `M${descent.origin.x},${descent.origin.y} V${descent.barY} M${Math.min(...xs)},${descent.barY} H${Math.max(...xs)} ${drops}`;
  return (
    <path className={descent.kind === 'biological' ? 'kt-line' : 'kt-line kt-line--dashed'} d={d} />
  );
}

