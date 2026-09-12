import test from 'node:test';
import assert from 'node:assert/strict';
import { addNote, createDatabase, createJob, createTicket, getJobMetrics, getMetrics, getTicket, listJobs, listTickets, screenJob, updateJob, updateTicket, validateTicket } from '../db.js';

function setup() { return createDatabase(':memory:'); }
const sample = { customer:'Alex Rivera', email:'alex@example.com', subject:'Cannot sign in', description:'Password reset link expired.', priority:'High' };

test('validates required fields and email', () => {
  assert.equal(validateTicket({}).length, 4);
  assert.deepEqual(validateTicket({ ...sample, email:'invalid' }), ['email must be valid']);
});

test('creates and retrieves a ticket with an activity event', () => {
  const db = setup(); const created = createTicket(db, sample); const saved = getTicket(db, created.id);
  assert.equal(saved.customer, 'Alex Rivera'); assert.equal(saved.status, 'Open'); assert.equal(saved.events.length, 1);
});

test('filters tickets by search, status, and priority', () => {
  const db = setup(); createTicket(db, sample); createTicket(db, { ...sample, customer:'Morgan Lee', subject:'Billing question', priority:'Low' });
  assert.equal(listTickets(db, { search:'billing' }).length, 1);
  assert.equal(listTickets(db, { status:'Open', priority:'High' }).length, 1);
});

test('records status changes and internal notes', () => {
  const db = setup(); const ticket = createTicket(db, sample);
  updateTicket(db, ticket.id, { status:'In Progress' }); addNote(db, ticket.id, 'Customer confirmed the issue.');
  const saved = getTicket(db, ticket.id);
  assert.equal(saved.status, 'In Progress'); assert.equal(saved.events.length, 3);
});

test('calculates dashboard metrics', () => {
  const db = setup(); const first = createTicket(db, { ...sample, priority:'Urgent' }); createTicket(db, sample); updateTicket(db, first.id, { status:'Resolved' });
  assert.deepEqual(getMetrics(db), { total:2, open:1, in_progress:0, waiting:0, resolved:1, urgent:0 });
});

test('screens jobs using remote work and compensation rules', () => {
  assert.equal(screenJob({ remote_type:'Remote', salary_min:60000 }).eligible, true);
  const result=screenJob({ remote_type:'Hybrid', salary_min:45000, travel_required:true });
  assert.equal(result.eligible, false); assert.equal(result.reasons.length, 3);
});

test('tracks eligible jobs through the application pipeline', () => {
  const db=setup(); const job=createJob(db,{company:'Example Co',role:'Support Specialist',source_url:'https://example.com/job',salary_min:60000,salary_max:70000,remote_type:'Remote'});
  assert.equal(job.status,'Reviewing'); updateJob(db,job.id,{status:'Applied',next_action_date:'2026-09-18'});
  assert.equal(listJobs(db,{status:'Applied'}).length,1); assert.equal(getJobMetrics(db).applied,1);
});

test('rejects jobs that violate saved work preferences', () => {
  const db=setup(); const job=createJob(db,{company:'Office Co',role:'Hybrid Support',source_url:'https://example.com/hybrid',salary_min:70000,remote_type:'Hybrid'});
  assert.equal(job.status,'Rejected'); assert.match(job.rejection_reason,/Not fully remote/);
});
