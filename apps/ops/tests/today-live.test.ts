import { describe, expect, it } from 'vitest';
import { buildTasks } from '@/lib/daily-tasks';
import { dateLabel, findPrep, isPrepTask, isScheduleTask, joinBooked, mapAreas, easternStartOfDay, nextPlanningCall, mapAvailabilityRequest, mapCaps, mapChat, mapNeeds, mapScheduleLines, mapTask, mapTasks, mapTickets, nameMap, pairLabel, taskKind, type AreaInput } from '@/lib/today-map';

const ME = 'u-me';
const KEITH = 'u-keith';
const NOW = new Date('2026-11-10T15:00:00Z');
const names = nameMap([
  { user_id: ME, display_name: 'Dana Mercer' },
  { user_id: KEITH, display_name: 'Keith Dawson' },
  { user_id: 'u-cam', display_name: 'Camila Keane' },
]);

const task = (o: Record<string, unknown>) => ({ id: 't1', title: 'A task', type: 'task', area_name: 'Outreach', due_on: null, comment_count: 0, mine: true, ...o });

describe('dateLabel', () => {
  it('writes the weekday and month for an Eastern day, across a year edge', () => {
    expect(dateLabel('2026-11-10')).toBe('Tue, Nov 10');
    expect(dateLabel('2027-01-01')).toBe('Fri, Jan 1');
  });
});

describe('task kinds and links', () => {
  it('maps the task type first, then the title', () => {
    expect(taskKind({ type: 'approval', title: 'Approve Q4 budget' })).toBe('approval');
    expect(taskKind({ type: 'request', title: 'x' })).toBe('request');
    expect(taskKind({ type: 'scoring', title: 'x' })).toBe('scoring');
    expect(taskKind({ type: 'post', title: 'Instagram post' })).toBe('post');
    expect(taskKind({ type: 'task', title: 'Share the interview schedule' })).toBe('schedule');
    expect(taskKind({ type: 'task', title: "Prep for Ada's interview" })).toBe('prep');
    expect(taskKind({ type: 'task', title: 'Order banners' })).toBe('task');
    expect(isScheduleTask('Send interview schedule to the board')).toBe(true);
    expect(isPrepTask('Prepare for interviews')).toBe(true);
    expect(isPrepTask('Prep the budget')).toBe(false);
  });

  it('gives each kind its one link, as the old Today did', () => {
    expect(mapTask(task({ type: 'approval' })).link).toEqual({ label: 'Review', href: '/finance/budget/approval' });
    expect(mapTask(task({ type: 'request' })).link).toEqual({ label: 'Add times', href: '/scholarships/interviews' });
    expect(mapTask(task({ type: 'scoring' })).link).toEqual({ label: 'Score', href: '/scholarships/scoring' });
    expect(mapTask(task({ title: "Prep for Ada's interview" })).link).toEqual({ label: 'Open questions', href: '/scholarships/interviews/questions' });
    expect(mapTask(task({ title: 'Order banners' })).link).toBeNull();
  });

  it('flags only the video-links task, and never invents waiting', () => {
    const v = mapTask(task({ title: 'Send interview video links' }));
    expect(v.videoLinks).toBe(true);
    expect(v.link?.label).toBe('Add links');
    expect(v.waiting).toBeNull();
    expect(mapTask(task({ title: 'Order banners' })).videoLinks).toBe(false);
  });

  it('keeps only the viewer\'s tasks, soonest first, undated last', () => {
    const rows = mapTasks([
      task({ id: 'a', title: 'Z undated', due_on: null }),
      task({ id: 'b', title: 'Later', due_on: '2026-11-20' }),
      task({ id: 'c', title: 'Sooner', due_on: '2026-11-09' }),
      task({ id: 'd', title: 'Not mine', due_on: '2026-11-01', mine: false }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('works from rows shaped like the database (buildTasks) and carries approvals and comments', () => {
    const built = buildTasks({
      me: ME,
      today: '2026-11-10',
      tasks: [
        { id: 't1', title: 'Approve Q4 budget', type: 'approval', area: 'money', status: 'open', due_on: '2026-11-12', archived: false, position: 0 },
        { id: 't2', title: 'Old', type: 'task', area: 'money', status: 'done', due_on: null, archived: false, position: 1, completed_at: '2026-11-09T12:00:00Z' },
        { id: 't3', title: 'Team only', type: 'task', area: 'outreach', status: 'open', due_on: null, archived: false, position: 2 },
      ],
      assignees: [{ task_id: 't1', user_id: ME, assigned_at: '2026-11-01' }, { task_id: 't3', user_id: KEITH, assigned_at: '2026-11-01' }],
      comments: [{ id: 'c1', task_id: 't1', author_id: KEITH, body: 'ok', created_at: '2026-11-02' }],
      types: [{ code: 'approval', label: 'Approval' }, { code: 'task', label: 'Task' }],
      areas: [{ slug: 'money', name: 'Finance' }, { slug: 'outreach', name: 'Outreach' }],
      checklists: [],
      people: [],
    });
    const mine = mapTasks(built.tasks);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: 't1', areaName: 'Finance', dueOn: '2026-11-12', kind: 'approval', commentCount: 1 });
    expect(built.tasks).toHaveLength(2); // teamOpen = every open task
  });
});

// Sample rows shaped like bookings / interview_slots / applications / interview_pairings.
const slots = [
  { id: 's1', cycle_id: 'c1', starts_at: '2026-11-12T22:30:00Z', ends_at: '2026-11-12T23:00:00Z', opened_at: '2026-11-09T14:00:00Z' },
  { id: 's2', cycle_id: 'c1', starts_at: '2026-11-18T22:00:00Z', ends_at: '2026-11-18T22:30:00Z', opened_at: '2026-11-09T14:00:00Z' },
  { id: 's3', cycle_id: 'c1', starts_at: '2026-11-05T22:00:00Z', ends_at: '2026-11-05T22:30:00Z', opened_at: '2026-11-01T14:00:00Z' },
  { id: 's4', cycle_id: 'c1', starts_at: '2026-11-19T22:00:00Z', ends_at: '2026-11-19T22:30:00Z', opened_at: '2026-11-09T14:00:00Z' },
];
const applications = [
  { id: 'a1', cycle_id: 'c1', applicant_code: 'APP-2026-00011', full_name: 'Ada Okafor' },
  { id: 'a2', cycle_id: 'c1', applicant_code: 'APP-2026-00012', full_name: 'Tariq Wells' },
  { id: 'a3', cycle_id: 'c1', applicant_code: 'APP-2026-00013', full_name: 'Past Person' },
  { id: 'a4', cycle_id: 'c1', applicant_code: 'APP-2026-00014', full_name: 'Camila Pair' },
  { id: 'a5', cycle_id: 'c1', applicant_code: 'APP-2026-00015', full_name: '  ' },
];
const bookings = [
  { application_id: 'a1', slot_id: 's1', status: 'active' },
  { application_id: 'a2', slot_id: 's2', status: 'active' },
  { application_id: 'a3', slot_id: 's3', status: 'active' },
  { application_id: 'a4', slot_id: 's4', status: 'active' },
];
const pairings = [
  { slot_id: 's1', interviewer_a: KEITH, interviewer_b: ME },
  { slot_id: 's2', interviewer_a: ME, interviewer_b: 'u-cam' },
  { slot_id: 's3', interviewer_a: ME, interviewer_b: KEITH },
  { slot_id: 's4', interviewer_a: 'u-cam', interviewer_b: KEITH },
];

describe('interview tickets', () => {
  const booked = joinBooked(bookings, slots, applications, pairings);

  it('joins each booking to its slot, applicant and pairing, sorted by time, and drops unreadable ones', () => {
    expect(booked.map((b) => b.slotId)).toEqual(['s3', 's1', 's2', 's4']);
    expect(joinBooked([{ application_id: 'zz', slot_id: 's1', status: 'active' }], slots, applications, pairings)).toEqual([]);
    expect(joinBooked([{ application_id: 'a1', slot_id: 'sZ', status: 'active' }], slots, applications, pairings)).toEqual([]);
    expect(joinBooked([{ application_id: 'a1', slot_id: 's1', status: 'released' }], slots, applications, pairings)).toEqual([]);
  });

  it('makes tickets only for the viewer\'s upcoming interviews, with the other interviewer and the length', () => {
    const t = mapTickets(booked, ME, names, NOW, []);
    expect(t.map((x) => x.id)).toEqual(['s1', 's2']); // s3 is past, s4 is paired without the viewer
    expect(t[0]).toMatchObject({ applicantName: 'Ada Okafor', code: 'APP-2026-00011', startsAt: '2026-11-12T22:30:00Z', minutes: 30, mode: 'Video', withName: 'Keith Dawson', prep: null });
    expect(t[1].withName).toBe('Camila Keane');
  });

  it('keeps a ticket through the interview and drops it once it ends', () => {
    const during = new Date('2026-11-12T22:45:00Z'); // s1 runs 22:30 to 23:00
    expect(mapTickets(booked, ME, names, during, []).map((x) => x.id)).toEqual(['s1', 's2']);
    expect(mapTickets(booked, ME, names, new Date('2026-11-12T23:00:00Z'), []).map((x) => x.id)).toEqual(['s2']);
  });

  it('falls back to the code when the applicant has no name', () => {
    const b = joinBooked([{ application_id: 'a5', slot_id: 's1', status: 'active' }], slots, applications, pairings);
    expect(b[0].name).toBe('APP-2026-00015');
  });

  it('links prep to the viewer\'s prep task and follows its status', () => {
    const open = findPrep({ name: 'Ada Okafor', code: 'APP-2026-00011' }, [{ id: 'p1', title: "Prep for Ada's interview", status: 'open', due_on: '2026-11-11' }]);
    expect(open).toEqual({ done: false, dueOn: '2026-11-11', href: '/scholarships/interviews/questions', taskId: 'p1' });
    const done = findPrep({ name: 'Ada Okafor', code: 'APP-2026-00011' }, [{ id: 'p1', title: 'Prep for interview APP-2026-00011', status: 'done', due_on: null }]);
    expect(done?.done).toBe(true);
    // A prep task for someone else, or a task that is not about prep, never matches.
    expect(findPrep({ name: 'Ada Okafor', code: 'APP-2026-00011' }, [{ id: 'p2', title: "Prep for Tariq's interview", status: 'open', due_on: null }])).toBeNull();
    expect(findPrep({ name: 'Ada Okafor', code: 'APP-2026-00011' }, [{ id: 'p3', title: 'Email Ada', status: 'open', due_on: null }])).toBeNull();
    const t = mapTickets(booked, ME, names, NOW, [{ id: 'p1', title: "Prep for Ada's interview", status: 'open', due_on: null }]);
    expect(t[0].prep?.taskId).toBe('p1');
    expect(t[1].prep).toBeNull();
  });

  it('writes the schedule lines for interviews ahead, with You first and the gold edge only on the viewer\'s', () => {
    const lines = mapScheduleLines(booked, ME, names, NOW);
    expect(lines.map((l) => l.code)).toEqual(['APP-2026-00011', 'APP-2026-00012', 'APP-2026-00014']);
    expect(lines[0]).toEqual({ name: 'Ada Okafor', code: 'APP-2026-00011', whenLabel: 'Thu Nov 12, 5:30 PM', pair: 'You + Keith Dawson', yours: true });
    expect(lines[2]).toMatchObject({ pair: 'Camila Keane + Keith Dawson', yours: false });
  });

  it('attaches the schedule only to the share-the-schedule task', () => {
    const lines = mapScheduleLines(booked, ME, names, NOW);
    expect(mapTask(task({ title: 'Share the interview schedule' }), lines).schedule).toHaveLength(3);
    expect(mapTask(task({ title: 'Order banners' }), lines).schedule).toBeNull();
    expect(mapTask(task({ title: 'Share the interview schedule' }), []).schedule).toBeNull();
  });

  it('says "Not paired yet" when nobody is paired', () => {
    expect(pairLabel({ ...booked[0], interviewerA: null, interviewerB: null }, ME, names)).toBe('Not paired yet');
  });
});

describe('booking needs', () => {
  const published = { id: 'c1', interview_end: '2026-11-20' };
  const submitted = applications.map((a) => ({ id: a.id, cycle_id: a.cycle_id, applicant_code: a.applicant_code, full_name: a.full_name }));

  it('counts submitted applicants against active bookings and lists the rest by name', () => {
    const n = mapNeeds({ cycle: published, submitted, activeBookings: bookings, slots })!;
    expect(n).toMatchObject({ title: 'Interview booking', dueOn: '2026-11-20', booked: 4, total: 5, remindedAt: null, suggestion: null });
    expect(n.unbooked).toEqual([{ id: 'a5', name: 'APP-2026-00015' }]);
    expect(n.unbooked.length).toBe(n.total - n.booked);
  });

  it('ignores released bookings and other cycles\' applicants', () => {
    const n = mapNeeds({
      cycle: published,
      submitted: [...submitted, { id: 'x', cycle_id: 'c0', applicant_code: 'APP-2025-00001', full_name: 'Old Cycle' }],
      activeBookings: [{ application_id: 'a1', slot_id: 's1', status: 'released' }],
      slots,
    })!;
    expect(n.total).toBe(5);
    expect(n.booked).toBe(0);
  });

  it('is null with no cycle, no times opened to students yet, no applicants, or when everyone has booked', () => {
    expect(mapNeeds({ cycle: null, submitted, activeBookings: bookings, slots })).toBeNull();
    expect(mapNeeds({ cycle: published, submitted, activeBookings: bookings, slots: slots.map((s) => ({ ...s, opened_at: null })) })).toBeNull();
    expect(mapNeeds({ cycle: published, submitted: [], activeBookings: [], slots })).toBeNull();
    expect(mapNeeds({ cycle: published, submitted: submitted.slice(0, 4), activeBookings: bookings, slots })).toBeNull();
  });

  it('has no due date when the cycle has no interview end', () => {
    expect(mapNeeds({ cycle: { id: 'c1', interview_end: null }, submitted, activeBookings: bookings, slots })!.dueOn).toBeNull();
  });
});

describe('areas', () => {
  const facts: AreaInput = {
    cycle: { interviewEnd: '2026-11-20', scored: 3, applications: 21 },
    fundsCents: 1_860_000,
    raisedCents: 420_000,
    raiseTargetCents: 520_000,
    programName: 'certification',
    programStatus: 'setting_up',
    planningCall: 'Thu Nov 19',
    monthName: 'November',
    postsPlanned: 4,
    postsDone: 2,
    nextPost: 'Fri Nov 13',
  };

  it('draws a bar, text, text and squares in the old order, with a peek each', () => {
    const rows = mapAreas(facts);
    expect(rows.map((r) => r.id)).toEqual(['scholarships', 'money', 'programs', 'outreach']);
    expect(rows[0]).toMatchObject({ icon: 'scholarships', href: '/scholarships/cycle', mark: { kind: 'bar', done: 3, total: 21, left: '3 of 21 scored', right: null }, peek: 'Interviews run to Fri Nov 20' });
    expect(rows[1]).toMatchObject({ name: 'Finance', mark: { kind: 'text', text: '$18,600 on hand' }, peek: '$4,200 of $5,200 raised' });
    expect(rows[2]).toMatchObject({ mark: { kind: 'text', text: 'Certifications in setup' }, peek: 'Planning call Thu Nov 19' });
    expect(rows[3]).toMatchObject({ mark: { kind: 'squares', done: 2, total: 4, left: '2 of 4 November posts' }, peek: 'Next post Fri Nov 13' });
  });

  it('says so, and invents nothing, when the facts are missing', () => {
    const rows = mapAreas({ ...facts, cycle: null, fundsCents: null, raiseTargetCents: null, programName: null, programStatus: null, planningCall: null, postsPlanned: 0, postsDone: 0, nextPost: null });
    expect(rows[0].mark).toMatchObject({ kind: 'bar', done: 0, total: 0 });
    expect(rows[0].peek).toBe('No interview dates yet');
    expect(rows[1].mark).toEqual({ kind: 'text', text: 'Funds not set' });
    expect(rows[1].peek).toBe('$4,200 raised');
    expect(rows[2].mark).toEqual({ kind: 'text', text: 'No programs yet' });
    expect(rows[2].peek).toBe('No planning call set');
    expect(rows[3].peek).toBe('No post scheduled');
  });
});

describe('board chat and caps', () => {
  const people = [{ user_id: KEITH, display_name: 'Keith Dawson', initials: 'KD' }];

  it('takes the newest message, its channel and the total unread', () => {
    const c = mapChat({
      messages: [
        { id: 'm1', channel_id: 'ch1', author_id: ME, is_bot: false, body: 'older', created_at: '2026-11-10T13:00:00Z' },
        { id: 'm2', channel_id: 'ch2', author_id: KEITH, is_bot: false, body: 'Can someone check the caption?', created_at: '2026-11-10T14:12:00Z' },
      ],
      unread: [{ unread: 3 }, { unread: '1' }],
      people,
      me: ME,
      areaChannelIds: ['ch1', 'ch2'],
    });
    expect(c).toEqual({ channelId: 'ch2', unread: 4, latest: { from: 'Keith Dawson', initials: 'KD', timeLabel: '9:12 AM', text: 'Can someone check the caption?', mine: false } });
  });

  it('ignores direct-message channels, so a private DM is never the card or the reply target', () => {
    const c = mapChat({
      messages: [
        { id: 'dm', channel_id: 'dm1', author_id: KEITH, is_bot: false, body: 'private', created_at: '2026-11-10T15:00:00Z' },
        { id: 'a', channel_id: 'ch1', author_id: KEITH, is_bot: false, body: 'public', created_at: '2026-11-10T14:00:00Z' },
      ],
      unread: [],
      people,
      me: ME,
      areaChannelIds: ['ch1'],
    });
    expect(c.channelId).toBe('ch1');
    expect(c.latest?.text).toBe('public');
    expect(mapChat({ messages: [{ id: 'dm', channel_id: 'dm1', author_id: KEITH, is_bot: false, body: 'x', created_at: '2026-11-10T15:00:00Z' }], unread: [], people, me: ME, areaChannelIds: ['ch1'] }).channelId).toBeNull();
  });

  it('marks the latest message mine when the viewer wrote it', () => {
    const c = mapChat({ messages: [{ id: 'm', channel_id: 'ch1', author_id: ME, is_bot: false, body: 'hi', created_at: '2026-11-10T14:00:00Z' }], unread: [], people: [{ user_id: ME, display_name: 'Dana Mercer', initials: 'DM' }], me: ME, areaChannelIds: ['ch1'] });
    expect(c.latest?.mine).toBe(true);
  });

  it('names a bot post BTX and has no channel (no reply box) when there is no message', () => {
    const bot = mapChat({ messages: [{ id: 'm', channel_id: 'ch1', author_id: null, is_bot: true, body: 'Reminder', created_at: '2026-11-10T14:00:00Z' }], unread: [], people, me: ME, areaChannelIds: ['ch1'] });
    expect(bot.latest).toMatchObject({ from: 'BTX', initials: 'BT' });
    expect(mapChat({ messages: [], unread: [], people, me: ME, areaChannelIds: ['ch1'] })).toEqual({ channelId: null, unread: 0, latest: null });
  });

  it('turns on reply only with a channel, and never remind, nudge or approve in place', () => {
    expect(mapCaps({ channelId: 'ch1', unread: 0, latest: null })).toEqual({ done: true, add: true, snooze: true, remind: false, nudge: false, reply: true, approveInPlace: false });
    expect(mapCaps({ channelId: null, unread: 0, latest: null })).toEqual({ done: true, add: true, snooze: true, remind: false, nudge: false, reply: false, approveInPlace: false });
  });
});

describe('availability request', () => {
  const cycle = { id: 'c1', closesAt: '2026-11-07T04:59:00Z', interviewStart: '2026-11-10', interviewEnd: '2026-11-20' };

  it('shows an unsent request as a prompt, not a stored task, due the Eastern close date', () => {
    expect(mapAvailabilityRequest({ cycle, sentAt: null, today: '2026-11-02' })).toEqual({
      id: 'availability-c1',
      title: 'Give your interview availability by Fri Nov 6',
      areaName: 'Scholarships',
      dueOn: '2026-11-06',
      kind: 'request',
      link: { label: 'Add times', href: '/scholarships/interviews/availability' },
      videoLinks: false,
      waiting: null,
      schedule: null,
      commentCount: 0,
      stored: false,
    });
  });

  it('still shows when late or due today, and on the last interview day', () => {
    expect(mapAvailabilityRequest({ cycle, sentAt: null, today: '2026-11-10' })?.dueOn).toBe('2026-11-06');
    expect(mapAvailabilityRequest({ cycle, sentAt: null, today: '2026-11-06' })?.dueOn).toBe('2026-11-06');
    expect(mapAvailabilityRequest({ cycle, sentAt: null, today: '2026-11-20' })).not.toBeNull();
  });

  it('has no date or "by" when the cycle has no close time', () => {
    const r = mapAvailabilityRequest({ cycle: { ...cycle, closesAt: null }, sentAt: null, today: '2026-11-02' })!;
    expect(r.dueOn).toBeNull();
    expect(r.title).toBe('Give your interview availability');
  });

  it('hides when sent, with no cycle, no interview dates, or interviews ended', () => {
    expect(mapAvailabilityRequest({ cycle, sentAt: '2026-11-03T12:00:00Z', today: '2026-11-04' })).toBeNull();
    expect(mapAvailabilityRequest({ cycle: null, sentAt: null, today: '2026-11-04' })).toBeNull();
    expect(mapAvailabilityRequest({ cycle: { ...cycle, interviewStart: null }, sentAt: null, today: '2026-11-04' })).toBeNull();
    expect(mapAvailabilityRequest({ cycle: { ...cycle, interviewEnd: null }, sentAt: null, today: '2026-11-04' })).toBeNull();
    expect(mapAvailabilityRequest({ cycle, sentAt: null, today: '2026-11-21' })).toBeNull();
  });
});

describe('Eastern day edges and planning calls', () => {
  it('finds the Eastern midnight instant, either side of the DST change', () => {
    expect(easternStartOfDay('2026-11-10')).toBe('2026-11-10T05:00:00.000Z'); // EST
    expect(easternStartOfDay('2026-07-01')).toBe('2026-07-01T04:00:00.000Z'); // EDT
    expect(easternStartOfDay('2026-11-01')).toBe('2026-11-01T04:00:00.000Z'); // the day clocks go back: still EDT at midnight
    expect(easternStartOfDay('2026-11-02')).toBe('2026-11-02T05:00:00.000Z');
  });

  it('does not treat last night\'s 7 PM Eastern call as next, but keeps tonight\'s', () => {
    const yesterdayEvening = { starts_at: '2026-11-10T00:00:00Z' }; // Nov 9, 7 PM EST
    const tonight = { starts_at: '2026-11-11T00:00:00Z' }; // Nov 10, 7 PM EST
    expect(nextPlanningCall([yesterdayEvening, tonight], '2026-11-10')).toBe(tonight);
    expect(nextPlanningCall([yesterdayEvening], '2026-11-10')).toBeNull();
  });
});

describe('tickets from another cycle', () => {
  it('still makes a ticket for a booking whose slot is ahead in a cycle that is not the one in play', () => {
    const oldSlots = [{ id: 'o1', cycle_id: 'c-old', starts_at: '2026-11-13T15:00:00Z', ends_at: '2026-11-13T15:30:00Z', opened_at: null }];
    const apps = [{ id: 'ao', cycle_id: 'c-old', applicant_code: 'APP-2026-00099', full_name: 'Other Cycle' }];
    const b = joinBooked([{ application_id: 'ao', slot_id: 'o1', status: 'active' }], oldSlots, apps, [{ slot_id: 'o1', interviewer_a: ME, interviewer_b: KEITH }]);
    expect(mapTickets(b, ME, names, NOW, []).map((x) => x.applicantName)).toEqual(['Other Cycle']);
  });
});
