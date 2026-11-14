import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Pedigree, Person, PersonId } from '../../domain';
import { t } from '../../i18n';
import { Button } from '../Button';
import { conditionShort, personAriaLabel, personName } from './describe';
import { NODE_SIZE, layoutPedigree } from './layout';
import type { LayoutNode, PedigreeLayout } from './layout';
import { Legend } from './Legend';
import { HALF, RING_OFFSET, nameLines } from './geometry';
import { CoupleLine, DescentLine, SexSymbol } from './shapes';
import { singleClick } from '../events';
import './PedigreeCanvas.css';

export type AddKind = 'parent' | 'sibling' | 'partner' | 'child';

export interface PedigreeCanvasProps {
  pedigree: Pedigree;
  selectedId: PersonId | null;
  /** People to ring in the evidence style. */
  highlightIds?: readonly PersonId[];
  /** Fade everyone who is not highlighted, so the highlighted people stand out. */
  dimOthers?: boolean;
  /** A small number shown on a person: how many guidelines count them. */
  counts?: Readonly<Record<PersonId, number>>;
  /** Pans the view to a person. A new token pans again, even to the same person. */
  centreOn?: { id: PersonId; token: number } | null;
  onSelect(id: PersonId): void;
  /** 'review' shows the tree without any way to change it. */
  mode: 'edit' | 'review';
  /** Enter on a person: open their details. */
  onOpen?(id: PersonId): void;
  onAdd?(kind: AddKind, id: PersonId): void;
  /** Delete on a person. The owner is expected to ask for confirmation. */
  onRequestDelete?(id: PersonId): void;
  /** Current year, so a birth year can be read out as an age. */
  referenceYear?: number;
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const ZOOM_STEP = 1.25;
const DEFAULT_SIZE = { width: 800, height: 520 };
/** Room around the tree for labels and the proband arrow. */
const MARGIN = { side: 80, top: 44, bottom: 110 };
const DRAG_THRESHOLD = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fitView(layout: PedigreeLayout, size: { width: number; height: number }): View {
  const left = layout.bounds.minX - MARGIN.side;
  const top = layout.bounds.minY - MARGIN.top;
  const width = layout.bounds.width + MARGIN.side * 2;
  const height = layout.bounds.height + MARGIN.top + MARGIN.bottom;
  const scale = clamp(Math.min(size.width / width, size.height / height), MIN_SCALE, 1.25);
  return {
    scale,
    tx: (size.width - width * scale) / 2 - left * scale,
    ty: (size.height - height * scale) / 2 - top * scale,
  };
}

/** What a screen reader says for a person: who they are, then what the ring and the number mean. */
function spokenLabel(label: string, isHighlighted: boolean, count: number | undefined): string {
  if (count !== undefined && count > 0) {
    return count === 1
      ? t('canvas.countedBy.one', { label })
      : t('canvas.countedBy.many', { label, count });
  }
  return isHighlighted ? t('canvas.evidence', { label }) : label;
}

/** The nearest person in the direction of an arrow key, favouring that direction's axis. */
function neighbour(nodes: readonly LayoutNode[], from: LayoutNode, key: string): LayoutNode | null {
  const direction: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const [dx, dy] = direction[key] ?? [0, 0];
  let best: LayoutNode | null = null;
  let bestCost = Infinity;
  for (const node of nodes) {
    if (node.id === from.id) continue;
    const along = (node.x - from.x) * dx + (node.y - from.y) * dy;
    const across = Math.abs((node.x - from.x) * dy) + Math.abs((node.y - from.y) * dx);
    if (along <= 0) continue;
    const cost = along + across * 2;
    if (cost < bestCost) {
      best = node;
      bestCost = cost;
    }
  }
  return best;
}

export function PedigreeCanvas({
  pedigree,
  selectedId,
  highlightIds = [],
  dimOthers = false,
  counts,
  centreOn = null,
  onSelect,
  mode,
  onOpen,
  onAdd,
  onRequestDelete,
  referenceYear,
}: PedigreeCanvasProps) {
  const layout = useMemo(() => layoutPedigree(pedigree), [pedigree]);
  // Reading order: top row first, left to right. Tab follows this order.
  const nodes = useMemo(
    () => [...layout.nodes].sort((a, b) => a.y - b.y || a.x - b.x),
    [layout],
  );
  const viewport = useRef<HTMLDivElement>(null);
  const nodeElements = useRef(new Map<PersonId, SVGGElement>());
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);
  // Until the user pans or zooms (manual view), the tree stays fitted as it grows.
  const [manualView, setManualView] = useState<View | null>(null);
  const fitted = useMemo(() => fitView(layout, size), [layout, size]);
  const view = manualView ?? fitted;
  const hintId = useId();

  // A request to show a person moves the view once per token. It is worked out
  // while rendering (not in an effect) so the tree never paints at the old place.
  const [centredToken, setCentredToken] = useState<number | null>(null);
  if (centreOn && centreOn.token !== centredToken) {
    setCentredToken(centreOn.token);
    const target = layout.nodes.find((node) => node.id === centreOn.id);
    if (target) {
      const scale = Math.max(view.scale, 1);
      setManualView({
        scale,
        tx: size.width / 2 - target.x * scale,
        ty: size.height / 2 - target.y * scale,
      });
    }
  }

  useEffect(() => {
    const element = viewport.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      setManualView((manual) => {
        const current = manual ?? fitted;
        const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
        const ratio = scale / current.scale;
        return { scale, tx: px - (px - current.tx) * ratio, ty: py - (py - current.ty) * ratio };
      });
    },
    [fitted],
  );

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    // React attaches wheel listeners as passive, which cannot stop the page scrolling.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - box.left, event.clientY - box.top);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!start.moved) event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, moved: true };
    setManualView((manual) => {
      const current = manual ?? fitted;
      return { ...current, tx: current.tx + dx, ty: current.ty + dy };
    });
  };
  const onPointerUp = () => {
    // Keep "moved" for the click that follows, then forget the drag.
    const wasDrag = drag.current?.moved === true;
    drag.current = wasDrag ? { x: 0, y: 0, moved: true } : null;
    if (wasDrag) setTimeout(() => (drag.current = null), 0);
  };

  const choose = (id: PersonId) => {
    if (drag.current?.moved) return;
    onSelect(id);
    onOpen?.(id);
  };

  const onNodeKeyDown = (event: KeyboardEvent<SVGGElement>, node: LayoutNode) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(node.id);
      onOpen?.(node.id);
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const next = neighbour(nodes, node, event.key);
      if (!next) return;
      onSelect(next.id);
      nodeElements.current.get(next.id)?.focus();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && mode === 'edit') {
      event.preventDefault();
      onRequestDelete?.(node.id);
    }
  };

  const centre = { x: size.width / 2, y: size.height / 2 };
  const selected = selectedId === null ? undefined : pedigree.persons[selectedId];
  const biologicalParents = pedigree.parentLinks.filter(
    (link) => link.childId === selectedId && link.kind === 'biological',
  ).length;
  const parentsFull = biologicalParents >= 2;
  const adoptedIn = new Set(
    pedigree.parentLinks.filter((link) => link.kind === 'adoptive').map((link) => link.childId),
  );

  return (
    <section className="kt-canvas" aria-label={t('canvas.title')}>
      <div className="kt-canvas__bar">
        <div className="kt-canvas__tools" role="group" aria-label={t('canvas.viewControls')}>
          <Button
            aria-label={t('canvas.zoomOut')}
            onClick={() => zoomAt(1 / ZOOM_STEP, centre.x, centre.y)}
          >
            −
          </Button>
          <Button
            aria-label={t('canvas.zoomIn')}
            onClick={() => zoomAt(ZOOM_STEP, centre.x, centre.y)}
          >
            +
          </Button>
          <Button onClick={() => setManualView(null)}>{t('canvas.fit')}</Button>
        </div>
        {mode === 'edit' && selected && selectedId !== null ? (
          <div
            className="kt-canvas__actions"
            role="group"
            aria-label={t('canvas.addFor', { name: personName(pedigree, selectedId) })}
          >
            <span className="kt-canvas__actions-label">
              {t('canvas.addFor', { name: personName(pedigree, selectedId) })}
            </span>
            <Button
              aria-disabled={parentsFull}
              aria-describedby={parentsFull ? hintId : undefined}
              title={parentsFull ? t('canvas.parentsFull') : undefined}
              onClick={singleClick(() => {
                if (!parentsFull) onAdd?.('parent', selectedId);
              })}
            >
              {t('canvas.addParent')}
            </Button>
            <Button onClick={singleClick(() => onAdd?.('sibling', selectedId))}>{t('canvas.addSibling')}</Button>
            <Button onClick={singleClick(() => onAdd?.('partner', selectedId))}>{t('canvas.addPartner')}</Button>
            <Button onClick={singleClick(() => onAdd?.('child', selectedId))}>{t('canvas.addChild')}</Button>
            {parentsFull ? (
              <span id={hintId} className="kt-canvas__hint">
                {t('canvas.parentsFull')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        ref={viewport}
        className="kt-canvas__viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg
          className="kt-canvas__svg"
          role="group"
          aria-label={t('canvas.treeLabel', { count: nodes.length })}
          width="100%"
          height="100%"
        >
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {layout.descents.map((descent) => (
              <DescentLine key={descent.id} descent={descent} />
            ))}
            {layout.couples.map((couple) => (
              <CoupleLine key={couple.id} couple={couple} />
            ))}
            {nodes.map((node) => {
              const person = pedigree.persons[node.id];
              if (!person) return null;
              return (
                <PersonNode
                  key={node.id}
                  node={node}
                  person={person}
                  name={personName(pedigree, node.id)}
                  label={spokenLabel(
                    personAriaLabel(pedigree, node.id, referenceYear),
                    highlightIds.includes(node.id),
                    counts?.[node.id],
                  )}
                  isProband={node.id === pedigree.probandId}
                  isSelected={node.id === selectedId}
                  isHighlighted={highlightIds.includes(node.id)}
                  isDimmed={dimOthers && !highlightIds.includes(node.id)}
                  count={counts?.[node.id]}
                  isAdoptedIn={adoptedIn.has(node.id)}
                  register={(element) => {
                    if (element) nodeElements.current.set(node.id, element);
                    else nodeElements.current.delete(node.id);
                  }}
                  onChoose={() => choose(node.id)}
                  onKeyDown={(event) => onNodeKeyDown(event, node)}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <Legend showCount={counts !== undefined} />
    </section>
  );
}

interface PersonNodeProps {
  node: LayoutNode;
  person: Person;
  name: string;
  label: string;
  isProband: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  count: number | undefined;
  isAdoptedIn: boolean;
  register(element: SVGGElement | null): void;
  onChoose(): void;
  onKeyDown(event: KeyboardEvent<SVGGElement>): void;
}

function PersonNode({
  node,
  person,
  name,
  label,
  isProband,
  isSelected,
  isHighlighted,
  isDimmed,
  count,
  isAdoptedIn,
  register,
  onChoose,
  onKeyDown,
}: PersonNodeProps) {
  const symbolClass = [
    'kt-node__symbol',
    person.healthHistoryUnknown === true ? 'kt-node__symbol--unknown-history' : '',
    isSelected ? 'kt-node__symbol--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const bracket = HALF + 9;
  // The arrow already says "You"; do not print the same word again as the name.
  const showName = !(isProband && name === t('canvas.you'));
  const lines = showName ? nameLines(name) : [];
  const firstLine = HALF + 20;
  const conditionsStart = firstLine + lines.length * 15;
  const labelHeight = (lines.length + person.conditions.length) * 15 + 12;

  // The printed labels sit beside the button, not inside it: a button whose
  // visible text differs from its spoken name confuses speech-input users.
  return (
    <>
    <g
      ref={register}
      className={isDimmed ? 'kt-node kt-node--dim' : 'kt-node'}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={isSelected}
      data-person-id={node.id}
      data-evidence={isHighlighted ? 'true' : undefined}
      transform={`translate(${node.x} ${node.y})`}
      onClick={onChoose}
      onKeyDown={onKeyDown}
    >
      {/* One generous target covering the symbol and its labels. */}
      <rect
        className="kt-node__hit"
        x={-64}
        y={-HALF - 10}
        width={128}
        height={NODE_SIZE + 10 + labelHeight}
      />
      {isHighlighted ? <SexSymbol sex={person.sex} half={HALF + RING_OFFSET} className="kt-node__evidence" /> : null}
      <SexSymbol sex={person.sex} half={HALF + RING_OFFSET + 5} className="kt-node__focus" />
      <SexSymbol sex={person.sex} half={HALF} className={symbolClass} />
      {person.deceased ? (
        <line className="kt-node__mark" x1={-HALF - 6} y1={HALF + 6} x2={HALF + 6} y2={-HALF - 6} />
      ) : null}
      {isAdoptedIn ? (
        <path
          className="kt-node__mark"
          d={`M${-bracket + 7},${-bracket} H${-bracket} V${bracket} H${-bracket + 7} M${bracket - 7},${-bracket} H${bracket} V${bracket} H${bracket - 7}`}
        />
      ) : null}
      {isProband ? (
        <g aria-hidden="true">
          <path
            className="kt-node__mark"
            d={`M${-HALF - 34},${HALF + 30} L${-HALF - 8},${HALF + 6} m-11,0 h11 v11`}
          />
        </g>
      ) : null}
    </g>
      <g
        className={isDimmed ? 'kt-node__labels kt-node--dim' : 'kt-node__labels'}
        aria-hidden="true"
        data-labels-for={node.id}
        transform={`translate(${node.x} ${node.y})`}
      >
        {count !== undefined && count > 0 ? (
          <g className="kt-node__count" data-count-for={node.id} transform={`translate(${HALF + 8} ${-HALF - 8})`}>
            <circle r={11} />
            <text y={4} textAnchor="middle">
              {count}
            </text>
          </g>
        ) : null}
        {isProband ? (
          <text className="kt-node__you" x={-HALF - 38} y={HALF + 46} textAnchor="middle">
            {t('canvas.you')}
          </text>
        ) : null}
        {lines.map((line, index) => (
          <text key={line} className="kt-node__name" y={firstLine + index * 15} textAnchor="middle">
            {line}
          </text>
        ))}
        {person.conditions.map((condition, index) => (
          <text
            key={condition.id}
            className="kt-node__condition"
            y={conditionsStart + index * 15}
            textAnchor="middle"
          >
            <tspan className={`kt-badge kt-badge--${condition.domain}`}>■ </tspan>
            {conditionShort(condition)}
          </text>
        ))}
      </g>
    </>
  );
}
