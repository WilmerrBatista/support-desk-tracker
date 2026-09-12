import test from 'node:test';
import assert from 'node:assert/strict';
import { addNote, createDatabase, createTicket, getMetrics, getTicket, listTickets, updateTicket, validateTicket } from '../db.js';

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
