import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../../src/App';
import { createSamplePedigree, serialize } from '../../../src/domain';
import { STORAGE_KEY, pedigreeStore } from '../../../src/state/store';
import { PedigreeCanvas } from '../../../src/ui/pedigree/PedigreeCanvas';

const state = () => pedigreeStore.getState();
const person = (id: string) => state().pedigree.persons[id];
const people = () => document.querySelectorAll('[data-person-id]');
const node = (id: string) => {
  const element = document.querySelector<SVGGElement>(`[data-person-id="${id}"]`);
  if (!element) throw new Error(`No node for ${id}`);
  return element;
};

/** The text printed under a person's symbol. */
const labels = (id: string) => {
  const element = document.querySelector(`[data-labels-for="${id}"]`);
  if (!element) throw new Error(`No labels for ${id}`);
  return element;
};

function renderBuilder() {
  return render(
    <MemoryRouter initialEntries={['/build']}>
      <App />
    </MemoryRouter>,
  );
}

async function loadSample() {
  renderBuilder();
  await userEvent.click(screen.getByRole('button', { name: 'Load sample family' }));
}

async function openPerson(id: string) {
  await userEvent.click(node(id));
  return screen.getByRole('complementary');
}

beforeEach(() => {
  state().clearAll();
  localStorage.clear();
});

describe('builder: start state', () => {
  it('offers three ways to start and keeps findings disabled with an explanation', () => {
    renderBuilder();
    expect(screen.getByRole('heading', { name: 'Start your family tree' })).toBeInTheDocument();
    for (const name of ['Start with me', 'Load sample family', 'Import a JSON file']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    const findings = screen.getByRole('button', { name: 'See findings' });
    expect(findings).toHaveAttribute('aria-disabled', 'true');
    expect(findings).toHaveAccessibleDescription(
      'Start your family tree first; then you can see findings.',
    );
    expect(screen.queryByRole('link', { name: 'See findings' })).not.toBeInTheDocument();
    expect(people()).toHaveLength(0);
  });

  it('loads the sample family, draws all ten people and saves it on this device', async () => {
    await loadSample();
    expect(people()).toHaveLength(10);
    expect(screen.queryByRole('heading', { name: 'Start your family tree' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See findings' })).toHaveAttribute('href', '/findings');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(serialize(createSamplePedigree()));
  });

  it('starts with me, then prompts for parents', async () => {
    renderBuilder();
    await userEvent.type(screen.getByLabelText('Your age (optional)'), '34');
    await userEvent.selectOptions(screen.getByLabelText('Your sex'), 'Female');
    await userEvent.click(screen.getByRole('button', { name: 'Start with me' }));

    expect(people()).toHaveLength(1);
    expect(person('p1')).toMatchObject({ sex: 'female', ageNow: 34 });
    expect(screen.getByText(/Next, add your parents/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add mother' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add father' }));
    expect(people()).toHaveLength(3);
    expect(screen.queryByText(/Next, add your parents/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mother' })).toBeInTheDocument();
  });

  it('refuses an age that is not a whole number and does not start', async () => {
    renderBuilder();
    await userEvent.type(screen.getByLabelText('Your age (optional)'), 'thirty');
    await userEvent.click(screen.getByRole('button', { name: 'Start with me' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your age as a whole number');
    expect(state().started).toBe(false);
  });

  it('resumes a saved tree instead of showing the start card', async () => {
    await loadSample();
    // A new visit: the page is rendered again with the same stored tree.
    document.body.replaceChildren();
    renderBuilder();
    expect(people()).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Clear everything' })).toBeInTheDocument();
  });
});

describe('builder: person drawer', () => {
  it('shows the person, their read-only relationship and their conditions', async () => {
    await loadSample();
    const drawer = await openPerson('mother');
    expect(within(drawer).getByRole('heading', { level: 2, name: 'Mother' })).toHaveFocus();
    expect(within(drawer).getByText('Relationship to you: Mother')).toBeInTheDocument();
    expect(within(drawer).getByLabelText('Current age')).toHaveValue('60');
    expect(within(drawer).getByLabelText('Age when it started')).toHaveValue('38');
    expect(within(drawer).getByLabelText('Condition')).toHaveValue('breast');
  });

  it.each<[string, string, RegExp]>([
    ['text instead of a number', 'sixty', /Not saved\. Enter a whole number/],
    ['a negative number', '-5', /Not saved\. Enter a whole number/],
    ['an age above 120', '121', /Not saved\. An age above 120/],
    ['an age younger than her own child', '20', /Not saved\. A biological parent is recorded as younger/],
    ['an age below the age her cancer started', '37', /Not saved\./],
  ])('does not save %s as an age, and says why', async (_name, typed, message) => {
    await loadSample();
    const drawer = await openPerson('mother');
    const age = within(drawer).getByLabelText('Current age');
    fireEvent.change(age, { target: { value: typed } });

    expect(within(drawer).getByRole('alert')).toHaveTextContent(message);
    expect(age).toHaveValue(typed);
    expect(age).toHaveAttribute('aria-invalid', 'true');
    expect(person('mother')?.ageNow).toBe(60);
  });

  it('saves a valid age and updates the tree label', async () => {
    await loadSample();
    const drawer = await openPerson('mother');
    fireEvent.change(within(drawer).getByLabelText('Current age'), { target: { value: '61' } });
    expect(within(drawer).queryByRole('alert')).not.toBeInTheDocument();
    expect(person('mother')?.ageNow).toBe(61);
    expect(node('mother')).toHaveAccessibleName('Mother, 61, breast cancer at 38');
  });

  it('does not add an undo step when the saved value is entered again', async () => {
    await loadSample();
    const drawer = await openPerson('mother');
    const steps = state().past.length;
    fireEvent.change(within(drawer).getByLabelText('Current age'), { target: { value: '60' } });
    fireEvent.change(within(drawer).getByLabelText('Age when it started'), { target: { value: '38' } });
    expect(state().past).toHaveLength(steps);
  });

  it('refuses an onset age later than the person has lived', async () => {
    await loadSample();
    const drawer = await openPerson('mother');
    fireEvent.change(within(drawer).getByLabelText('Age when it started'), { target: { value: '70' } });
    expect(within(drawer).getByRole('alert')).toHaveTextContent(/Not saved\. A condition is recorded as starting/);
    expect(person('mother')?.conditions[0]?.ageAtOnset).toBe(38);
  });

  it('adds a condition and shows its badge text on the tree', async () => {
    await loadSample();
    const drawer = await openPerson('sister');
    expect(within(drawer).getByRole('button', { name: 'Add condition' })).toBeDisabled();
    await userEvent.selectOptions(within(drawer).getByLabelText('Add a condition'), 'Ovarian cancer');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add condition' }));
    expect(labels('sister')).toHaveTextContent('Ovarian ?');

    fireEvent.change(within(drawer).getByLabelText('Age when it started'), { target: { value: '29' } });
    expect(labels('sister')).toHaveTextContent('Ovarian 29');
    expect(node('sister')).toHaveAccessibleName('Sister, 31, ovarian cancer at 29');
    expect(person('sister')?.conditions).toEqual([
      { id: 'c1', code: 'ovarian', domain: 'cancer', ageAtOnset: 29, ageUnknown: false, confirmed: 'reported' },
    ]);
  });

  it('edits a condition: unknown age, both breasts, certainty, then removes it', async () => {
    await loadSample();
    const drawer = await openPerson('mother');
    await userEvent.selectOptions(within(drawer).getByLabelText('Which breast'), 'Both (bilateral)');
    await userEvent.selectOptions(within(drawer).getByLabelText('How sure are you?'), 'Not sure');
    await userEvent.click(within(drawer).getByLabelText('I don’t know the age'));
    expect(person('mother')?.conditions[0]).toEqual({
      id: 'c1',
      code: 'breast',
      domain: 'cancer',
      ageUnknown: true,
      laterality: 'bilateral',
      confirmed: 'unsure',
    });
    expect(within(drawer).getByLabelText('Age when it started')).toBeDisabled();
    expect(node('mother')).toHaveAccessibleName('Mother, 60, breast cancer, age not known (not sure)');

    await userEvent.click(within(drawer).getByRole('button', { name: /Remove this condition/ }));
    expect(person('mother')?.conditions).toEqual([]);
    expect(within(drawer).getByText('No conditions recorded.')).toBeInTheDocument();
  });

  it('offers conditions in two groups and a "premature" detail for heart conditions', async () => {
    await loadSample();
    const drawer = await openPerson('father');
    const select = within(drawer).getByLabelText('Add a condition');
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label)).toEqual([
      'Cancer',
      'Heart and metabolic',
    ]);
    await userEvent.click(within(drawer).getByLabelText('It was described as early (premature)'));
    expect(person('father')?.conditions[0]?.subtype).toBe('premature');
    expect(within(drawer).queryByLabelText('Which breast')).not.toBeInTheDocument();
  });

  it('records living status, including "I don’t know", and switches the age field', async () => {
    await loadSample();
    const drawer = await openPerson('mgf');
    await userEvent.selectOptions(within(drawer).getByLabelText('Living or deceased'), 'Deceased');
    fireEvent.change(within(drawer).getByLabelText('Age at death'), { target: { value: '81' } });
    expect(person('mgf')).toMatchObject({ deceased: true, ageAtDeath: 81 });
    await userEvent.selectOptions(within(drawer).getByLabelText('Living or deceased'), 'I don’t know');
    expect(person('mgf')).toMatchObject({ deceased: false, vitalStatusUnknown: true });
    expect(person('mgf')).not.toHaveProperty('ageAtDeath');
    await userEvent.click(within(drawer).getByLabelText(/I don’t know this person’s health history/));
    expect(person('mgf')?.healthHistoryUnknown).toBe(true);
  });
});

describe('builder: adding and removing relatives', () => {
  it('disables Add parent, with an explanation, when two biological parents exist', async () => {
    await loadSample();
    await openPerson('mother');
    const addParent = screen.getByRole('button', { name: 'Add parent' });
    expect(addParent).toHaveAttribute('aria-disabled', 'true');
    expect(addParent).toHaveAccessibleDescription(/Two biological parents are already recorded/);
    await userEvent.click(addParent);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(people()).toHaveLength(10);
    expect(state().lastError).toBeNull();
  });

  it('adds a parent after asking what kind, and opens the new person', async () => {
    await loadSample();
    await openPerson('mgm');
    await userEvent.click(screen.getByRole('button', { name: 'Add parent' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a parent of Maternal grandmother' });
    expect(within(dialog).getByLabelText('Biological')).toBeChecked();
    await userEvent.click(within(dialog).getByLabelText('Adoptive'));
    await userEvent.selectOptions(within(dialog).getByLabelText('Their sex'), 'Female');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(people()).toHaveLength(11);
    expect(state().pedigree.parentLinks).toContainEqual({ childId: 'mgm', parentId: 'p1', kind: 'adoptive' });
    expect(screen.getByRole('complementary')).toHaveTextContent('Relationship to you: Not a blood relative');
  });

  it('asks full or half before adding a sibling, and which parent a half-sibling shares', async () => {
    await loadSample();
    await openPerson('proband');
    await userEvent.click(screen.getByRole('button', { name: 'Add sibling' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a sibling of You' });
    await userEvent.click(within(dialog).getByLabelText(/Half-sibling/));
    await userEvent.selectOptions(within(dialog).getByLabelText('Which parent do they share?'), 'Father');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('complementary')).toHaveTextContent('Relationship to you: Half-sibling');
  });

  it('adds a partner straight away and a child with the chosen other parent', async () => {
    await loadSample();
    await openPerson('sister');
    await userEvent.click(screen.getByRole('button', { name: 'Add partner' }));
    expect(people()).toHaveLength(11);
    await userEvent.click(node('sister'));
    await userEvent.click(screen.getByRole('button', { name: 'Add child' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a child of Sister' });
    expect(within(dialog).getByLabelText('Other parent')).toHaveValue('p1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(state().pedigree.parentLinks.filter((link) => link.childId === 'p2')).toHaveLength(2);
    expect(screen.getByRole('complementary')).toHaveTextContent('Relationship to you: Niece or nephew');
  });

  it('asks before removing, and lists who else would be cut off', async () => {
    await loadSample();
    const drawer = await openPerson('mother');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Remove Mother from the tree' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Mother?' });
    for (const name of ['Maternal aunt', 'Maternal grandfather', 'Maternal grandmother']) {
      expect(within(dialog).getByText(name)).toBeInTheDocument();
    }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(people()).toHaveLength(10);

    await userEvent.click(within(drawer).getByRole('button', { name: 'Remove Mother from the tree' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove all 4 people' }));
    expect(people()).toHaveLength(6);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

describe('builder: toolbar', () => {
  it('undoes and redoes with the buttons and with the keyboard', async () => {
    await loadSample();
    const drawer = await openPerson('mother');
    fireEvent.change(within(drawer).getByLabelText('Current age'), { target: { value: '61' } });
    expect(person('mother')?.ageNow).toBe(61);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(person('mother')?.ageNow).toBe(60);
    expect(within(drawer).getByLabelText('Current age')).toHaveValue('60');
    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(person('mother')?.ageNow).toBe(61);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(person('mother')?.ageNow).toBe(60);

    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(node('mother')).toHaveAccessibleName('Mother, 61, breast cancer at 38');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(node('mother')).toHaveAccessibleName('Mother, 60, breast cancer at 38');
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  });

  it('needs confirmation before clearing everything, and explains that data stays on this device', async () => {
    await loadSample();
    await userEvent.click(screen.getByRole('button', { name: 'Clear everything' }));
    const dialog = screen.getByRole('dialog', { name: 'Clear everything?' });
    expect(dialog).toHaveTextContent('stored only on this device');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(people()).toHaveLength(10);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Clear everything' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, clear everything' }));
    expect(screen.getByRole('heading', { name: 'Start your family tree' })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('rejects a bad JSON file with a visible error and imports a good one', async () => {
    renderBuilder();
    const input = screen.getByLabelText('Family tree file to import');
    await userEvent.upload(input, new File(['{ not json'], 'tree.json', { type: 'application/json' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That file could not be imported:');
    expect(alert).toHaveTextContent('not valid JSON');
    expect(state().started).toBe(false);

    const cycle = JSON.parse(serialize(createSamplePedigree())) as { parentLinks: unknown[] };
    cycle.parentLinks.push({ childId: 'mgm', parentId: 'proband', kind: 'biological' });
    await userEvent.upload(input, new File([JSON.stringify(cycle)], 'tree.json', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('own ancestor'));
    expect(state().started).toBe(false);

    const good = new File([serialize(createSamplePedigree())], 'tree.json', { type: 'application/json' });
    await userEvent.upload(input, good);
    await waitFor(() => expect(people()).toHaveLength(10));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists the five guideline profiles with their publisher and scope', async () => {
    await loadSample();
    const select = screen.getByLabelText('Guideline');
    expect(within(select).getAllByRole('option')).toHaveLength(5);
    expect(screen.getByText(/National Institute for Health and Care Excellence \(NICE\)\. Published for England/)).toBeInTheDocument();
    await userEvent.selectOptions(select, 'Lynch syndrome: Amsterdam II criteria');
    expect(screen.getByText(/International Collaborative Group on HNPCC.*International\./)).toBeInTheDocument();
  });

  it('offers Quick add once a tree is started, ready to type into', async () => {
    await loadSample();
    expect(screen.getByRole('heading', { name: 'Quick add' })).toBeInTheDocument();
    expect(screen.getByLabelText('Describe your family in your own words')).toBeEnabled();
  });
});

describe('builder: what we don’t know', () => {
  it('shows data completeness as a labelled bar and at most five gaps', async () => {
    await loadSample();
    const bar = screen.getByRole('progressbar', { name: /^Data completeness \d+%$/ });
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(screen.getByText(/It is not a measure of anyone’s health/)).toBeInTheDocument();
    expect(screen.getByText(/Missing information is never treated as healthy\./)).toBeInTheDocument();
    const fixes = screen.getAllByRole('link', { name: /^Fix: / });
    expect(fixes).toHaveLength(5);
    expect(screen.getByText('And 4 more.')).toBeInTheDocument();
  });

  it('selects the person and focuses the missing field when a gap is chosen', async () => {
    await loadSample();
    await userEvent.click(screen.getByRole('link', { name: 'Fix: Age is not known for Maternal aunt.' }));
    const drawer = screen.getByRole('complementary');
    expect(within(drawer).getByRole('heading', { level: 2, name: 'Maternal aunt' })).toBeInTheDocument();
    expect(within(drawer).getByLabelText('Age at death')).toHaveFocus();
    expect(node('maunt')).toHaveAttribute('aria-pressed', 'true');
  });

  it('raises completeness when a gap is filled', async () => {
    await loadSample();
    const value = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));
    const before = value();
    const drawer = await openPerson('mgf');
    fireEvent.change(within(drawer).getByLabelText('Current age'), { target: { value: '85' } });
    expect(value()).toBeGreaterThan(before);
  });
});

describe('builder: keyboard and dialogs', () => {
  it('moves selection with the arrow keys, opens with Enter and asks before Delete removes', async () => {
    await loadSample();
    node('mother').focus();
    fireEvent.keyDown(node('mother'), { key: 'ArrowDown' });
    expect(node('sister')).toHaveAttribute('aria-pressed', 'true');
    expect(node('sister')).toHaveFocus();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    fireEvent.keyDown(node('sister'), { key: 'ArrowLeft' });
    expect(node('proband')).toHaveFocus();
    fireEvent.keyDown(node('proband'), { key: 'ArrowRight' });
    fireEvent.keyDown(node('sister'), { key: 'Enter' });
    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 })).toHaveTextContent('Sister');

    fireEvent.keyDown(node('sister'), { key: 'Delete' });
    const dialog = screen.getByRole('dialog', { name: 'Remove Sister?' });
    expect(people()).toHaveLength(10);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(people()).toHaveLength(9);
  });

  it('refuses to remove the proband, with an explanation', async () => {
    await loadSample();
    fireEvent.keyDown(node('proband'), { key: 'Delete' });
    expect(screen.getByRole('dialog', { name: 'You cannot be removed' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(people()).toHaveLength(10);
  });

  it('keeps focus inside a dialog, closes it on Escape and returns focus', async () => {
    await loadSample();
    const opener = screen.getByRole('button', { name: 'Clear everything' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Yes, clear everything' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(confirm).toHaveFocus();
    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab();
    expect(confirm).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(people()).toHaveLength(10);
  });

  it('lists people in reading order so Tab moves through them top row first', async () => {
    await loadSample();
    expect([...people()].map((element) => element.getAttribute('data-person-id'))).toEqual([
      'pgf',
      'pgm',
      'mgf',
      'mgm',
      'puncle',
      'father',
      'mother',
      'maunt',
      'proband',
      'sister',
    ]);
  });
});

describe('PedigreeCanvas', () => {
  const sample = createSamplePedigree();

  it('has no add buttons in review mode and rings the highlighted people', () => {
    render(
      <PedigreeCanvas
        pedigree={sample}
        selectedId="mother"
        highlightIds={['mother', 'maunt']}
        mode="review"
        onSelect={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-person-id] .kt-node__evidence')).toHaveLength(2);
    expect(node('mother').querySelector('.kt-node__evidence')).not.toBeNull();
    expect(node('father').querySelector('.kt-node__evidence')).toBeNull();
  });

  it('does not react to Delete in review mode', () => {
    const onRequestDelete = vi.fn();
    render(
      <PedigreeCanvas
        pedigree={sample}
        selectedId={null}
        mode="review"
        onSelect={() => undefined}
        onRequestDelete={onRequestDelete}
      />,
    );
    fireEvent.keyDown(node('sister'), { key: 'Delete' });
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it('labels every person for screen readers and marks the proband as You', () => {
    render(<PedigreeCanvas pedigree={sample} selectedId={null} mode="edit" onSelect={() => undefined} />);
    expect(node('proband')).toHaveAccessibleName('You, 34');
    expect(node('mgm')).toHaveAccessibleName('Maternal grandmother, deceased, breast cancer at 52');
    expect(node('pgm')).toHaveAccessibleName('Paternal grandmother, health history not known');
    expect(labels('puncle')).toHaveTextContent('Heart 54');
    expect(labels('proband')).toHaveTextContent('You');
  });

  it('zooms with the buttons and returns to the fitted view', async () => {
    render(<PedigreeCanvas pedigree={sample} selectedId={null} mode="edit" onSelect={() => undefined} />);
    const transform = () => document.querySelector('svg > g')?.getAttribute('transform');
    const fitted = transform();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(transform()).not.toBe(fitted);
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(transform()).not.toBe(fitted);
    await userEvent.click(screen.getByRole('button', { name: 'Fit to screen' }));
    expect(transform()).toBe(fitted);
  });

  it('explains the symbols in a legend that opens and closes', async () => {
    render(<PedigreeCanvas pedigree={sample} selectedId={null} mode="edit" onSelect={() => undefined} />);
    const toggle = screen.getByRole('button', { name: 'Show what the symbols mean' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Square: male')).not.toBeVisible();
    await userEvent.click(toggle);
    expect(screen.getByText('Square: male')).toBeVisible();
    expect(screen.getByText('Double line: partners who are blood relatives')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Hide what the symbols mean' }));
    expect(screen.queryByText('Square: male')).not.toBeVisible();
  });
});
