import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Button } from '../Button';

const ITEMS: { key: MessageKey; drawing: ReactElement }[] = [
  { key: 'legend.male', drawing: <rect className="kt-node__symbol" x="4" y="4" width="20" height="20" /> },
  { key: 'legend.female', drawing: <circle className="kt-node__symbol" cx="14" cy="14" r="10" /> },
  {
    key: 'legend.unknownSex',
    drawing: <polygon className="kt-node__symbol" points="14,2 26,14 14,26 2,14" />,
  },
  {
    key: 'legend.deceased',
    drawing: (
      <>
        <circle className="kt-node__symbol" cx="14" cy="14" r="9" />
        <line className="kt-node__mark" x1="2" y1="26" x2="26" y2="2" />
      </>
    ),
  },
  {
    key: 'legend.proband',
    drawing: <path className="kt-node__mark" d="M3,25 L22,6 m-10,0 h10 v10" />,
  },
  {
    key: 'legend.historyUnknown',
    drawing: (
      <rect
        className="kt-node__symbol kt-node__symbol--unknown-history"
        x="4"
        y="4"
        width="20"
        height="20"
      />
    ),
  },
  {
    key: 'legend.adopted',
    drawing: <path className="kt-node__mark" d="M9,3 H4 V25 H9 M19,3 H24 V25 H19" />,
  },
  {
    key: 'legend.consanguineous',
    drawing: <path className="kt-line" d="M2,11 H26 M2,17 H26" />,
  },
  {
    key: 'legend.former',
    drawing: <path className="kt-line" d="M2,14 H26 M10,20 l4,-12 M15,20 l4,-12" />,
  },
  {
    key: 'legend.notBiological',
    drawing: <path className="kt-line kt-line--dashed" d="M14,2 V26" />,
  },
  {
    key: 'legend.evidence',
    drawing: (
      <>
        <circle className="kt-node__evidence" cx="14" cy="14" r="12" />
        <circle className="kt-node__symbol" cx="14" cy="14" r="7" />
      </>
    ),
  },
  { key: 'legend.cancer', drawing: <rect className="kt-badge kt-badge--cancer" x="7" y="7" width="14" height="14" /> },
  { key: 'legend.cardio', drawing: <rect className="kt-badge kt-badge--cardio" x="7" y="7" width="14" height="14" /> },
  {
    key: 'legend.metabolic',
    drawing: <rect className="kt-badge kt-badge--metabolic" x="7" y="7" width="14" height="14" />,
  },
];

const COUNT_ITEM: (typeof ITEMS)[number] = {
  key: 'legend.count',
  drawing: (
    <g className="kt-node__count" transform="translate(14 14)">
      <circle r="11" />
      <text y="4" textAnchor="middle">
        2
      </text>
    </g>
  ),
};

/** Explains the symbols. Collapsed until asked for. */
export function Legend({ showCount = false }: { showCount?: boolean }) {
  const items = showCount ? [...ITEMS, COUNT_ITEM] : ITEMS;
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className="kt-legend">
      <Button aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        {open ? t('legend.hide') : t('legend.show')}
      </Button>
      <ul id={listId} className="kt-legend__list" hidden={!open}>
        {items.map((item) => (
          <li key={item.key}>
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
              {item.drawing}
            </svg>
            <span>{t(item.key)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
