import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { transform } from 'esbuild';

// Execute the actual component handler with controlled database/network responses.
const source = await readFile(new URL('../src/AuthedApp.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  const handleAssignVolunteer = async');
const end = source.indexOf('  const handleAssignOther =', start);
const { code } = await transform(`${source.slice(start, end)}\nhandleAssignVolunteer;`, { loader: 'ts' });

function setup(options = {}) {
  const state = { loading: false, message: '', closed: false, assignments: [], writes: [], notifications: [], warnings: [] };
  const notify = (input) => {
    state.notifications.push(input);
    return options.notify ? options.notify(input) : Promise.resolve(null);
  };
  const saved = { id: 'saved-id', created_at: '2026-11-16T12:00:00Z', notes: 'Shadow Shift: Alex' };
  const context = {
    assignInFlightRef: { current: false },
    assignOtherLoading: false,
    assignShiftInstanceId: 42,
    assignOtherMode: options.mode ?? 'shadow',
    volunteers: [{ id: 'volunteer-1', full_name: 'Alex', preferred_name: null, role: 'Regular Volunteer', phone: null }],
    instanceShifts: [{ instanceId: 42, templateId: 3, title: 'Morning', start: new Date('2026-11-16T12:00:00Z'), end: new Date('2026-11-16T14:00:00Z') }],
    weekAssignments: {},
    session: { user: { id: 'admin-1' } },
    setAssignLoading: (value) => { state.loading = value; },
    setAssignMessage: (value) => { state.message = value; },
    addWeekAssignmentLocally: (value) => state.assignments.push(value),
    setShiftInstancesRefreshToken: () => {},
    closeAssignVolunteerModal: () => { state.closed = true; },
    refreshShiftViewsInBackground: () => {},
    buildVolunteerShadowShiftNote: (name) => `Shadow Shift: ${name}`,
    formatShiftAddedNotificationLabel: (shift) => shift?.title ?? 'Shift',
    getDateKey: (date) => date.toISOString().slice(0, 10),
    startOfDay: (date) => date,
    recordShiftUpdateNotificationEvent: notify,
    sendAdminPush: notify,
    notifyLeadsOnShiftInstance: notify,
    sendVolunteerPush: notify,
    isExpectedPushSkip: () => false,
    console: { warn: (...args) => state.warnings.push(args), error: () => {} },
    supabase: {
      from: () => {
        let mutation = false;
        const query = {
          select: () => mutation
            ? (options.save ? options.save() : Promise.resolve(options.saveResult ?? { data: [saved], error: null }))
            : query,
          eq: () => query,
          limit: async () => ({ data: options.previous ? [options.previous] : [], error: null }),
          insert: (payload) => { mutation = true; state.writes.push({ method: 'insert', payload }); return query; },
          update: (payload) => { mutation = true; state.writes.push({ method: 'update', payload }); return query; },
        };
        return query;
      },
    },
  };
  return { state, context, run: vm.runInNewContext(code, context) };
}

test('shadow assignment updates the shift and closes without waiting for notifications', async () => {
  const { state, run } = setup({ notify: () => new Promise(() => {}) });
  await run('volunteer-1');
  assert.equal(state.closed, true);
  assert.equal(state.loading, false);
  assert.equal(state.assignments[0].id, 'saved-id');
  assert.equal(state.assignments[0].shift_instance.id, 42);
  assert.equal(state.assignments[0].notes, 'Shadow Shift: Alex');
  assert.equal(state.writes[0].payload.notes, 'Shadow Shift: Alex');
  assert.equal(state.notifications.length, 4);
});

test('normal assignment uses the same successful flow without adding shadow notes', async () => {
  const { state, run } = setup({ mode: 'other', saveResult: { data: [{ id: 'regular-id', notes: null }], error: null } });
  await run('volunteer-1');
  assert.equal(state.closed, true);
  assert.equal(state.assignments[0].notes, null);
  assert.equal('notes' in state.writes[0].payload, false);
});

test('reactivates a dropped assignment instead of inserting a duplicate', async () => {
  const { state, run } = setup({ previous: { id: 'dropped-id', status: 'dropped' } });
  await run('volunteer-1');
  assert.equal(state.writes[0].method, 'update');
  assert.equal(state.writes[0].payload.status, 'active');
  assert.equal(state.closed, true);
});

test('existing active assignment does not trigger another write', async () => {
  const { state, run } = setup({ previous: { id: 'existing-id', status: 'active' } });
  await run('volunteer-1');
  assert.match(state.message, /already on this shift/);
  assert.equal(state.writes.length, 0);
  assert.equal(state.loading, false);
});

test('database errors keep the modal open and restore the controls', async () => {
  const { state, context, run } = setup({ saveResult: { data: null, error: { message: 'Permission denied' } } });
  await run('volunteer-1');
  assert.equal(state.message, 'Permission denied');
  assert.equal(state.closed, false);
  assert.equal(state.assignments.length, 0);
  assert.equal(state.notifications.length, 0);
  assert.equal(state.loading, false);
  assert.equal(context.assignInFlightRef.current, false);
});

test('an empty save response is not shown as a successful assignment', async () => {
  const { state, run } = setup({ saveResult: { data: [], error: null } });
  await run('volunteer-1');
  assert.match(state.message, /could not be confirmed/);
  assert.equal(state.closed, false);
  assert.equal(state.assignments.length, 0);
});

test('unexpected network exceptions restore the controls', async () => {
  const { state, context, run } = setup({ save: () => Promise.reject(new Error('Network failed')) });
  await run('volunteer-1');
  assert.match(state.message, /Unable to confirm/);
  assert.equal(state.loading, false);
  assert.equal(context.assignInFlightRef.current, false);
  assert.equal(state.closed, false);
});

test('rapid double clicks only save one assignment', async () => {
  let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  const { state, run } = setup({ save: () => pending });
  const first = run('volunteer-1');
  await run('volunteer-1');
  complete({ data: [{ id: 'single-id', notes: null }], error: null });
  await first;
  assert.equal(state.writes.length, 1);
  assert.equal(state.assignments.length, 1);
});

test('notification failures cannot undo the saved assignment or leave loading stuck', async () => {
  const { state, run } = setup({ notify: () => Promise.reject(new Error('Push failed')) });
  await run('volunteer-1');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.closed, true);
  assert.equal(state.loading, false);
  assert.equal(state.assignments.length, 1);
  assert.equal(state.warnings.length, 4);
});
