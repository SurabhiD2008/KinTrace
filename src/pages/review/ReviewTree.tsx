import { useId, useState } from 'react';
import type { Pedigree, PersonId } from '../../domain';
import { t } from '../../i18n';
import { Button } from '../../ui';
import { PedigreeCanvas } from '../../ui/pedigree/PedigreeCanvas';
import { PersonPopover } from './PersonPopover';

/** Ask the tree to show a person: pan to them and open their details. */
export interface ShowRequest {
  id: PersonId;
  token: number;
  /** Where focus goes back to when the details close. */
  returnTo?: HTMLElement | null;
}

export interface ReviewTreeProps {
  pedigree: Pedigree;
  referenceYear: number;
  highlightIds: readonly PersonId[];
  dimOthers?: boolean;
  counts?: Readonly<Record<PersonId, number>>;
  show: ShowRequest | null;
}

/** The family tree in review mode, with read-only details and a hide control on small screens. */
export function ReviewTree({
  pedigree,
  referenceYear,
  highlightIds,
  dimOthers = false,
  counts,
  show,
}: ReviewTreeProps) {
  const bodyId = useId();
  const [expanded, setExpanded] = useState(true);
  const [popover, setPopover] = useState<{ id: PersonId; returnTo: HTMLElement | null } | null>(null);
  const [selectedId, setSelectedId] = useState<PersonId | null>(null);

  // A new request from a relative chip opens that person, once per token.
  const [shownToken, setShownToken] = useState<number | null>(null);
  if (show && show.token !== shownToken) {
    setShownToken(show.token);
    setSelectedId(show.id);
    setPopover({ id: show.id, returnTo: show.returnTo ?? null });
    setExpanded(true);
  }

  const close = () => {
    if (!popover) return;
    setPopover(null);
    // Back to the chip that opened the details, or else to the person on the tree.
    const fallback = document.querySelector<SVGGElement>(`[data-person-id="${popover.id}"]`);
    (popover.returnTo ?? fallback)?.focus();
  };

  return (
    <div className="kt-review__tree">
      <Button
        className="kt-review__tree-toggle"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? t('review.tree.hide') : t('review.tree.show')}
      </Button>
      <div
        id={bodyId}
        className={expanded ? 'kt-review__tree-body' : 'kt-review__tree-body kt-review__tree-body--collapsed'}
      >
        <PedigreeCanvas
          pedigree={pedigree}
          selectedId={selectedId}
          mode="review"
          referenceYear={referenceYear}
          highlightIds={highlightIds}
          dimOthers={dimOthers}
          {...(counts !== undefined && { counts })}
          centreOn={show}
          onSelect={setSelectedId}
          onOpen={(id) => setPopover({ id, returnTo: null })}
        />
        {popover ? (
          <PersonPopover
            pedigree={pedigree}
            personId={popover.id}
            referenceYear={referenceYear}
            onClose={close}
          />
        ) : null}
      </div>
    </div>
  );
}
