import { useId, useState } from 'react';
import { addChild, addParent, addSibling } from '../../domain';
import type { MutationResult, ParentLinkKind, Pedigree, PersonId, Sex } from '../../domain';
import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Button, Dialog } from '../../ui';
import { personName } from '../../ui/pedigree/describe';

export interface AddRelativeDialogProps {
  kind: 'parent' | 'sibling' | 'child';
  pedigree: Pedigree;
  personId: PersonId;
  /** Receives the mutation to run; the caller applies it and selects the new person. */
  onAdd(mutation: (pedigree: Pedigree) => MutationResult): void;
  onClose(): void;
}

const SEXES: readonly Sex[] = ['female', 'male', 'intersex', 'unknown'];
const LINK_KINDS: readonly ParentLinkKind[] = ['biological', 'adoptive', 'step'];

/** Asks the one or two questions needed before a parent, sibling or child can be added. */
export function AddRelativeDialog({ kind, pedigree, personId, onAdd, onClose }: AddRelativeDialogProps) {
  const id = useId();
  const name = personName(pedigree, personId);
  const biologicalParents = pedigree.parentLinks
    .filter((link) => link.childId === personId && link.kind === 'biological')
    .map((link) => link.parentId);
  const partners = pedigree.partnerships
    .filter((pair) => pair.aId === personId || pair.bId === personId)
    .map((pair) => (pair.aId === personId ? pair.bId : pair.aId));

  const [sex, setSex] = useState<Sex>('unknown');
  const [linkKind, setLinkKind] = useState<ParentLinkKind>('biological');
  const [siblingType, setSiblingType] = useState<'full' | 'half'>('full');
  const [sharedParentId, setSharedParentId] = useState(biologicalParents[0] ?? '');
  const [otherParentId, setOtherParentId] = useState(partners[0] ?? '');

  const titleKey: MessageKey = `add.${kind}.title`;
  const needsSharedParent = kind === 'sibling' && siblingType === 'half' && biologicalParents.length === 2;

  const submit = () => {
    if (kind === 'parent') {
      onAdd((ped) => addParent(ped, personId, { sex }, linkKind));
    } else if (kind === 'sibling') {
      onAdd((ped) =>
        addSibling(
          ped,
          personId,
          { sex },
          needsSharedParent ? { type: 'half', sharedParentId } : { type: siblingType },
        ),
      );
    } else {
      onAdd((ped) => addChild(ped, personId, { sex }, otherParentId === '' ? {} : { otherParentId }));
    }
  };

  return (
    <Dialog title={t(titleKey, { name })} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {kind === 'parent' ? (
          <fieldset className="kt-choices">
            <legend>{t('add.parent.kind')}</legend>
            {LINK_KINDS.map((option) => {
              const key: MessageKey = `add.parent.${option}`;
              return (
                <label key={option} className="kt-check">
                  <input
                    type="radio"
                    name={`${id}-kind`}
                    checked={linkKind === option}
                    onChange={() => setLinkKind(option)}
                  />
                  <span>{t(key)}</span>
                </label>
              );
            })}
          </fieldset>
        ) : null}

        {kind === 'sibling' ? (
          <fieldset className="kt-choices">
            <legend>{t('add.sibling.type')}</legend>
            {(['full', 'half'] as const).map((option) => {
              const key: MessageKey = `add.sibling.${option}`;
              return (
                <label key={option} className="kt-check">
                  <input
                    type="radio"
                    name={`${id}-type`}
                    checked={siblingType === option}
                    onChange={() => setSiblingType(option)}
                  />
                  <span>{t(key)}</span>
                </label>
              );
            })}
          </fieldset>
        ) : null}

        {needsSharedParent ? (
          <div className="kt-field">
            <label htmlFor={`${id}-shared`}>{t('add.sibling.sharedParent')}</label>
            <select
              id={`${id}-shared`}
              value={sharedParentId}
              onChange={(event) => setSharedParentId(event.target.value)}
            >
              {biologicalParents.map((parentId) => (
                <option key={parentId} value={parentId}>
                  {personName(pedigree, parentId)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {kind === 'child' && partners.length > 0 ? (
          <div className="kt-field">
            <label htmlFor={`${id}-other`}>{t('add.child.otherParent')}</label>
            <select
              id={`${id}-other`}
              value={otherParentId}
              onChange={(event) => setOtherParentId(event.target.value)}
            >
              {partners.map((partnerId) => (
                <option key={partnerId} value={partnerId}>
                  {personName(pedigree, partnerId)}
                </option>
              ))}
              <option value="">{t('add.child.noOtherParent')}</option>
            </select>
          </div>
        ) : null}

        <div className="kt-field">
          <label htmlFor={`${id}-sex`}>{t('add.sex')}</label>
          <select id={`${id}-sex`} value={sex} onChange={(event) => setSex(event.target.value as Sex)}>
            {SEXES.map((option) => {
              const key: MessageKey = `sex.${option}`;
              return (
                <option key={option} value={option}>
                  {t(key)}
                </option>
              );
            })}
          </select>
        </div>

        <div className="kt-dialog__actions">
          <Button type="submit" variant="primary">
            {t('add.confirm')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
