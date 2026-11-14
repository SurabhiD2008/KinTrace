import { useMemo } from 'react';
import type { Pedigree, PersonId } from '../../domain';
import { t } from '../../i18n';
import { conditionShort, personName } from './describe';
import { HALF, RING_OFFSET, nameLines } from './geometry';
import { layoutPedigree } from './layout';
import { CoupleLine, DescentLine, SexSymbol } from './shapes';
import './PedigreeCanvas.css';

export interface StaticPedigreeProps {
  pedigree: Pedigree;
  /** People to ring in the evidence style. */
  highlightIds?: readonly PersonId[];
  /** The label printed under each person; defaults to their name. */
  nameFor?: (id: PersonId) => string;
  /** What a screen reader says for the whole drawing. */
  label: string;
  className?: string;
}

/** Room around the tree for labels and the proband arrow, as on the interactive tree. */
const MARGIN = { side: 80, top: 44, bottom: 110 };

/**
 * The family tree as one plain vector drawing: no buttons, no zoom. It
 * scales to whatever box it is placed in, so it prints sharply and fits a page.
 */
export function StaticPedigree({ pedigree, highlightIds = [], nameFor, label, className }: StaticPedigreeProps) {
  const layout = useMemo(() => layoutPedigree(pedigree), [pedigree]);
  const name = nameFor ?? ((id: PersonId) => personName(pedigree, id));
  const adoptedIn = new Set(pedigree.parentLinks.filter((l) => l.kind === 'adoptive').map((l) => l.childId));
  const { minX, minY, width, height } = layout.bounds;
  const viewBox = `${minX - MARGIN.side} ${minY - MARGIN.top} ${width + MARGIN.side * 2} ${height + MARGIN.top + MARGIN.bottom}`;

  return (
    <svg className={className} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
      {layout.descents.map((descent) => (
        <DescentLine key={descent.id} descent={descent} />
      ))}
      {layout.couples.map((couple) => (
        <CoupleLine key={couple.id} couple={couple} />
      ))}
      {layout.nodes.map((node) => {
        const person = pedigree.persons[node.id];
        if (!person) return null;
        const isProband = node.id === pedigree.probandId;
        const shown = name(node.id);
        const lines = isProband && shown === t('canvas.you') ? [] : nameLines(shown);
        const firstLine = HALF + 20;
        const conditionsStart = firstLine + lines.length * 15;
        const bracket = HALF + 9;
        const ringed = highlightIds.includes(node.id);
        const symbolClass =
          person.healthHistoryUnknown === true ? 'kt-node__symbol kt-node__symbol--unknown-history' : 'kt-node__symbol';
        return (
          <g key={node.id} transform={`translate(${node.x} ${node.y})`} data-static-person={node.id} data-evidence={ringed ? 'true' : undefined}>
            {ringed ? <SexSymbol sex={person.sex} half={HALF + RING_OFFSET} className="kt-node__evidence" /> : null}
            <SexSymbol sex={person.sex} half={HALF} className={symbolClass} />
            {person.deceased ? <line className="kt-node__mark" x1={-HALF - 6} y1={HALF + 6} x2={HALF + 6} y2={-HALF - 6} /> : null}
            {adoptedIn.has(node.id) ? (
              <path
                className="kt-node__mark"
                d={`M${-bracket + 7},${-bracket} H${-bracket} V${bracket} H${-bracket + 7} M${bracket - 7},${-bracket} H${bracket} V${bracket} H${bracket - 7}`}
              />
            ) : null}
            {isProband ? (
              <>
                <path className="kt-node__mark" d={`M${-HALF - 34},${HALF + 30} L${-HALF - 8},${HALF + 6} m-11,0 h11 v11`} />
                <text className="kt-node__you" x={-HALF - 38} y={HALF + 46} textAnchor="middle">
                  {t('canvas.you')}
                </text>
              </>
            ) : null}
            {lines.map((line, index) => (
              <text key={`${line}-${index}`} className="kt-node__name" y={firstLine + index * 15} textAnchor="middle">
                {line}
              </text>
            ))}
            {person.conditions.map((condition, index) => (
              <text key={condition.id} className="kt-node__condition" y={conditionsStart + index * 15} textAnchor="middle">
                <tspan className={`kt-badge kt-badge--${condition.domain}`}>■ </tspan>
                {conditionShort(condition)}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
