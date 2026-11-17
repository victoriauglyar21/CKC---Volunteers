import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { build, transform } from 'esbuild';

// Execute the actual component handler with controlled database/network responses.
const source = await readFile(new URL('../src/AuthedApp.tsx', import.meta.url), 'utf8');
const utilityBuild = await build({
  entryPoints: [new URL('../src/authedApp/utils.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const { buildVolunteerShadowShiftNote } = await import(`data:text/javascript;base64,${Buffer.from(utilityBuild.outputFiles[0].text).toString('base64')}`);
const start = source.indexOf('  const handleAssignVolunteer = async');
const end = source.indexOf('  const handleAssignOther =', start);
const helperSource = await readFile(new URL('../src/authedApp/services/assignmentRequest.ts', import.meta.url), 'utf8');
const helperCode = await transform(helperSource, { loader: 'ts' });
const { assignmentRequest } = await import(`data:text/javascript;base64,${Buffer.from(helperCode.code).toString('base64')}`);
const { code } = await transform(`${source.slice(start, end)}\nhandleAssignVolunteer;`, { loader: 'ts' });

function setup(options = {}) {
  const state = { loading: false, message: '', closed: false, assignments: [], writes: [], notifications: [], warnings: [], notice: '' };
  const notify = (input) => {
    state.notifications.push(input);
    return options.notify ? options.notify(input) : Promise.resolve(null);
  };
  const saved = { id: 'saved-id', created_at: '2026-11-16T12:00:00Z', notes: 'Shadow Shift: Alex' };
  const context = {
    assignmentRequest: (request) => assignmentRequest(request, options.timeoutMs ?? 15000),
    Error,
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
    setAssignmentNotice: (value) => { state.notice = value; },
    addWeekAssignmentLocally: (value) => state.assignments.push(value),
    setShiftInstancesRefreshToken: () => {},
    closeAssignVolunteerModal: () => { state.closed = true; },
    refreshShiftViewsInBackground: () => {},
    buildVolunteerShadowShiftNote,
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
          select: () => query,
          abortSignal: () => query,
          then: (resolve, reject) => Promise.resolve().then(() => mutation
            ? (options.save ? options.save() : options.saveResult ?? { data: [saved], error: null })
            : { data: options.previous ? [options.previous] : [], error: null }
          ).then(resolve, reject),
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
  assert.match(state.notice, /Alex added to the shadow shift/);
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
  const { state, run } = setup({ previous: { id: 'existing-id', status: 'active', notes: 'Shadow Shift: Alex' } });
  await run('volunteer-1');
  assert.equal(state.closed, true);
  assert.equal(state.assignments[0].id, 'existing-id');
  assert.equal(state.notifications.length, 0);
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
  assert.match(state.message, /Network failed/);
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


test('a stalled save times out and restores the controls without claiming success', async () => {
  const { state, context, run } = setup({ timeoutMs: 10, save: () => new Promise(() => {}) });
  await run('volunteer-1');
  assert.match(state.message, /taking too long/);
  assert.equal(state.closed, false);
  assert.equal(state.loading, false);
  assert.equal(context.assignInFlightRef.current, false);
  assert.equal(state.assignments.length, 0);
});

test('admin adding a volunteer activates their existing pending request', async () => {
  const { state, run } = setup({ previous: { id: 'pending-id', status: 'pending' } });
  await run('volunteer-1');
  assert.equal(state.closed, true);
  assert.equal(state.writes[0].method, 'update');
  assert.equal(state.writes[0].payload.status, 'active');
  assert.equal(state.loading, false);
});

test('an active regular assignment can be marked as a shadow shift', async () => {
  const { state, run } = setup({ previous: { id: 'existing-id', status: 'active', notes: null } });
  await run('volunteer-1');
  assert.equal(state.writes[0].method, 'update');
  assert.equal(state.writes[0].payload.notes, 'Shadow Shift: Alex');
  assert.equal(state.closed, true);
});

test('frontend capacity never blocks saving another volunteer', async () => {
  const { state, context, run } = setup();
  context.instanceShifts[0].capacity = 1;
  context.weekAssignments[42] = Array.from({ length: 12 }, (_, index) => ({ volunteer: { id: `other-${index}` } }));
  await run('volunteer-1');
  assert.equal(state.writes.length, 1);
  assert.equal(state.closed, true);
});

const otherStart = source.indexOf('  const handleAssignOther =');
const otherEnd = source.indexOf('  const approveShiftRequest =', otherStart);
const otherCode = await transform(`${source.slice(otherStart, otherEnd)}\nhandleAssignOther;`, { loader: 'ts' });

function setupOther(options = {}) {
  const base = setup(options);
  Object.assign(base.context, {
    useCallback: (fn) => fn,
    assignOtherName: 'Club group',
    assignOtherDetails: '',
    buildOtherAssignmentNote: (name) => name,
    formatTimeRangeFromInstance: () => 'Morning',
    setAssignOtherLoading: (value) => { base.state.loading = value; },
  });
  return { ...base, run: vm.runInNewContext(otherCode.code, base.context) };
}

test('Add Other closes after saving even when notifications never finish', async () => {
  const { state, run } = setupOther({ notify: () => new Promise(() => {}) });
  await run();
  assert.equal(state.closed, true);
  assert.equal(state.loading, false);
  assert.equal(state.assignments[0].id, 'saved-id');
});

test('Add Other restores controls after a failed save', async () => {
  const { state, context, run } = setupOther({ save: () => Promise.reject(new Error('Network failed')) });
  await run();
  assert.equal(state.closed, false);
  assert.equal(state.loading, false);
  assert.equal(context.assignInFlightRef.current, false);
  assert.equal(state.message, 'Network failed');
});

test('request timeout aborts a stalled fetch', async () => {
  let requestSignal;
  await assert.rejects(assignmentRequest((signal) => {
    requestSignal = signal;
    return new Promise(() => {});
  }, 5), /taking too long/);
  assert.equal(requestSignal.aborted, true);
});


test('confirming an existing shadow shift preserves its saved details', async () => {
  const notes = 'Shadow Shift: Alex — Orientation with lead';
  const { state, run } = setup({ previous: { id: 'existing-id', status: 'active', notes } });
  await run('volunteer-1');
  assert.equal(state.closed, true);
  assert.equal(state.writes.length, 0);
  assert.equal(state.assignments[0].notes, notes);
});
