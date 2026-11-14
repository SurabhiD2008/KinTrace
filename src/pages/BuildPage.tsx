import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  addParent,
  addPartner,
  createPedigree,
  createSamplePedigree,
  deserialize,
  removePerson,
  serialize,
} from '../domain';
import type { GapField, MutationResult, Pedigree, PersonId, Sex } from '../domain';
import { t } from '../i18n';
import { selectCanRedo, selectCanUndo, usePedigreeStore } from '../state/store';
import { useUiStore } from '../state/ui';
import { BUILD_PARAMS, Button, CompletenessPanel, Dialog, ROUTES } from '../ui';
import { singleClick } from '../ui/events';
import { QuickAdd } from '../ui/QuickAdd/QuickAdd';
import { PedigreeCanvas } from '../ui/pedigree/PedigreeCanvas';
import type { AddKind } from '../ui/pedigree/PedigreeCanvas';
import { personName } from '../ui/pedigree/describe';
import { AddRelativeDialog } from './build/AddRelativeDialog';
import { PersonDrawer } from './build/PersonDrawer';
import type { DrawerField } from './build/PersonDrawer';
import { StartCard } from './build/StartCard';
import { Toolbar } from './build/Toolbar';
import { MAX_IMPORT_BYTES, downloadTextFile, readTextFile } from './build/files';
import './build/build.css';


type OpenDialog =
  | { type: 'add'; kind: 'parent' | 'sibling' | 'child'; id: PersonId }
  | { type: 'remove'; id: PersonId; stranded: PersonId[] }
  | { type: 'cannot-remove' }
  | { type: 'clear' }
  | null;

/** The drawer field that answers each kind of gap; the others open at the person's heading. */
const GAP_FIELDS: Partial<Record<GapField, DrawerField>> = {
  sex: 'sex',
  age: 'age',
  vitalStatus: 'vitalStatus',
  healthHistory: 'healthHistory',
  conditionOnset: 'conditionOnset',
  conditionConfirmation: 'conditionOnset',
};

const isGapField = (value: string): value is GapField =>
  [
    'biologicalParent',
    'sex',
    'vitalStatus',
    'age',
    'conditionOnset',
    'conditionConfirmation',
    'conditionLaterality',
    'healthHistory',
    'biologicalFamily',
  ].includes(value);

export function BuildPage() {
  const pedigree = usePedigreeStore((state) => state.pedigree);
  const started = usePedigreeStore((state) => state.started);
  const storageBlocked = usePedigreeStore((state) => state.storageBlocked);
  const canUndo = usePedigreeStore(selectCanUndo);
  const canRedo = usePedigreeStore(selectCanRedo);
  const apply = usePedigreeStore((state) => state.apply);
  const replace = usePedigreeStore((state) => state.replace);
  const undo = usePedigreeStore((state) => state.undo);
  const redo = usePedigreeStore((state) => state.redo);
  const clearAll = usePedigreeStore((state) => state.clearAll);
  const guidelineId = useUiStore((state) => state.guidelineId);
  const setGuidelineId = useUiStore((state) => state.setGuidelineId);

  const [selectedId, setSelectedId] = useState<PersonId | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focus, setFocus] = useState<{ token: number; field: DrawerField | null }>({
    token: 0,
    field: null,
  });
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [parentsPrompt, setParentsPrompt] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // The page may read the clock; the domain never does.
  const referenceYear = useMemo(() => new Date().getFullYear(), []);

  const selected = selectedId !== null && selectedId in pedigree.persons ? selectedId : null;

  const openDrawer = useCallback((id: PersonId, field: DrawerField | null = null) => {
    setSelectedId(id);
    setDrawerOpen(true);
    setFocus((current) => ({ token: current.token + 1, field }));
  }, []);

  // A Fix link from the findings page (or the panel here) opens a person at the
  // missing field. Handled once per address, while rendering, so nothing flickers.
  const { search } = useLocation();
  const [handledSearch, setHandledSearch] = useState<string | null>(null);
  if (search !== handledSearch) {
    setHandledSearch(search);
    const params = new URLSearchParams(search);
    const personId = params.get(BUILD_PARAMS.person);
    const field = params.get(BUILD_PARAMS.field) ?? '';
    if (personId !== null && personId in pedigree.persons) {
      openDrawer(personId, isGapField(field) ? (GAP_FIELDS[field] ?? null) : null);
      if (field === 'biologicalParent') setParentsPrompt(true);
    }
  }

  /** Runs a mutation that adds someone, then opens the new person's details. */
  const addAndOpen = (mutation: (ped: Pedigree) => MutationResult) => {
    const result = apply(mutation);
    if (result.ok && result.createdId !== null) openDrawer(result.createdId);
    setDialog(null);
  };

  const onAdd = (kind: AddKind, id: PersonId) => {
    if (kind === 'partner') addAndOpen((ped) => addPartner(ped, id));
    else setDialog({ type: 'add', kind, id });
  };

  const requestRemove = (id: PersonId) => {
    if (id === pedigree.probandId) {
      setDialog({ type: 'cannot-remove' });
      return;
    }
    const attempt = removePerson(pedigree, id);
    const stranded = !attempt.ok && attempt.error.code === 'would_disconnect' ? attempt.error.personIds : [];
    setDialog({ type: 'remove', id, stranded });
  };

  const importFile = async (file: File) => {
    // Refused before reading, so a huge file is never loaded into memory.
    if (file.size > MAX_IMPORT_BYTES) {
      setImportErrors([t('io.tooLarge')]);
      return;
    }
    let text: string;
    try {
      text = await readTextFile(file);
    } catch {
      setImportErrors([t('import.unreadable')]);
      return;
    }
    const result = deserialize(text);
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    setImportErrors([]);
    replace(result.pedigree);
    setSelectedId(null);
    setDrawerOpen(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const start = (details: { sex: Sex; ageNow?: number }) => {
    const fresh = createPedigree(details);
    replace(fresh);
    setSelectedId(fresh.probandId);
    setParentsPrompt(true);
  };

  const addParentOf = (sex: Sex) => {
    const result = apply((ped) => addParent(ped, ped.probandId, { sex }));
    if (!result.ok) setParentsPrompt(false);
  };
  const probandParentIds = pedigree.parentLinks
    .filter((link) => link.childId === pedigree.probandId && link.kind === 'biological')
    .map((link) => link.parentId);
  const probandParents = probandParentIds.length;
  // Each button goes once that parent exists, so a second press cannot add a second mother.
  const hasParentOf = (sex: Sex) => probandParentIds.some((id) => pedigree.persons[id]?.sex === sex);

  const removing = dialog?.type === 'remove' ? dialog : null;

  return (
    <main className="page kt-build">
      <header className="kt-build__header">
        <h1>{t('build.title')}</h1>
        <Link to={ROUTES.home} className="link-target">
          {t('build.home')}
        </Link>
      </header>

      <Toolbar
        guidelineId={guidelineId}
        onGuidelineChange={setGuidelineId}
        started={started}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onExport={() => downloadTextFile(t('export.fileName'), serialize(pedigree))}
        onImport={() => fileInput.current?.click()}
      />
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        aria-label={t('import.fileLabel')}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so that choosing the same file again still fires a change.
          event.target.value = '';
          if (file) void importFile(file);
        }}
      />

      {importErrors.length > 0 ? (
        <div className="kt-notice kt-notice--error" role="alert">
          <p>{t('import.failed')}</p>
          <ul>
            {importErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <Button onClick={() => setImportErrors([])}>{t('common.dismiss')}</Button>
        </div>
      ) : null}

      {!started ? (
        <StartCard
          onStart={start}
          onLoadSample={() => replace(createSamplePedigree())}
          onImport={() => fileInput.current?.click()}
        />
      ) : (
        <>
          {parentsPrompt && probandParents < 2 ? (
            <div className="kt-notice">
              <p>{t('build.parentsPrompt')}</p>
              <div className="row">
                {hasParentOf('female') ? null : (
                  <Button onClick={singleClick(() => addParentOf('female'))}>{t('build.addMother')}</Button>
                )}
                {hasParentOf('male') ? null : (
                  <Button onClick={singleClick(() => addParentOf('male'))}>{t('build.addFather')}</Button>
                )}
                <Button onClick={() => setParentsPrompt(false)}>{t('common.notNow')}</Button>
              </div>
            </div>
          ) : null}

          <QuickAdd pedigree={pedigree} onApply={replace} onEdit={(id) => openDrawer(id)} />

          <div className={drawerOpen && selected !== null ? 'kt-build__main kt-build__main--drawer' : 'kt-build__main'}>
            <PedigreeCanvas
              pedigree={pedigree}
              selectedId={selected}
              mode="edit"
              referenceYear={referenceYear}
              onSelect={setSelectedId}
              onOpen={(id) => openDrawer(id)}
              onAdd={onAdd}
              onRequestDelete={requestRemove}
            />
            {drawerOpen && selected !== null ? (
              <PersonDrawer
                pedigree={pedigree}
                personId={selected}
                referenceYear={referenceYear}
                focusToken={focus.token}
                focusField={focus.field}
                apply={apply}
                onClose={() => setDrawerOpen(false)}
                onRequestDelete={requestRemove}
              />
            ) : null}
          </div>

          <CompletenessPanel pedigree={pedigree} referenceYear={referenceYear} />

          <div className="kt-build__footer">
            {storageBlocked ? null : <p className="muted">{t('build.savedHere')}</p>}
            <Button onClick={() => setDialog({ type: 'clear' })}>{t('clear.button')}</Button>
          </div>
        </>
      )}

      {dialog?.type === 'add' ? (
        <AddRelativeDialog
          kind={dialog.kind}
          pedigree={pedigree}
          personId={dialog.id}
          onAdd={addAndOpen}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {removing ? (
        <Dialog
          title={t('remove.title', { name: personName(pedigree, removing.id) })}
          onClose={() => setDialog(null)}
        >
          {removing.stranded.length > 0 ? (
            <>
              <p>{t('remove.stranded')}</p>
              <ul>
                {removing.stranded.map((id) => (
                  <li key={id}>{personName(pedigree, id)}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>{t('remove.body')}</p>
          )}
          <div className="kt-dialog__actions">
            <Button
              variant="primary"
              onClick={() => {
                apply((ped) => removePerson(ped, removing.id, { cascade: true }));
                setSelectedId(null);
                setDrawerOpen(false);
                setDialog(null);
              }}
            >
              {removing.stranded.length > 0
                ? t('remove.confirmAll', { count: removing.stranded.length + 1 })
                : t('remove.confirm')}
            </Button>
            <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          </div>
        </Dialog>
      ) : null}

      {dialog?.type === 'cannot-remove' ? (
        <Dialog title={t('remove.probandTitle')} onClose={() => setDialog(null)}>
          <p>{t('mutation.cannot_remove_proband')}</p>
          <div className="kt-dialog__actions">
            <Button variant="primary" onClick={() => setDialog(null)}>
              {t('common.ok')}
            </Button>
          </div>
        </Dialog>
      ) : null}

      {dialog?.type === 'clear' ? (
        <Dialog title={t('clear.title')} onClose={() => setDialog(null)}>
          <p>{t('clear.body')}</p>
          <div className="kt-dialog__actions">
            <Button
              variant="primary"
              onClick={() => {
                clearAll();
                setSelectedId(null);
                setDrawerOpen(false);
                setParentsPrompt(false);
                setImportErrors([]);
                setDialog(null);
              }}
            >
              {t('clear.confirm')}
            </Button>
            <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          </div>
        </Dialog>
      ) : null}
    </main>
  );
}
