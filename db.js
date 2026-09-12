import { DatabaseSync } from 'node:sqlite';

const allowedStatuses = new Set(['Open', 'In Progress', 'Waiting', 'Resolved']);
const allowedPriorities = new Set(['Low', 'Medium', 'High', 'Urgent']);
const allowedJobStatuses = new Set(['Found', 'Reviewing', 'Ready to Apply', 'Applied', 'Interview', 'Offer', 'Closed', 'Rejected']);

export function createDatabase(path = 'support-desk.db') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      priority TEXT NOT NULL DEFAULT 'Medium',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS job_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      source_url TEXT NOT NULL UNIQUE,
      salary_min INTEGER,
      salary_max INTEGER,
      remote_type TEXT NOT NULL DEFAULT 'Remote',
      travel_required INTEGER NOT NULL DEFAULT 0,
      weekend_required INTEGER NOT NULL DEFAULT 0,
      on_call_required INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Found',
      notes TEXT NOT NULL DEFAULT '',
      rejection_reason TEXT NOT NULL DEFAULT '',
      next_action_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

export function screenJob(input) {
  const reasons = [];
  if (input.remote_type !== 'Remote') reasons.push('Not fully remote');
  if (!Number.isFinite(Number(input.salary_min)) || Number(input.salary_min) < 50000) reasons.push('Minimum salary is below $50,000 or unverified');
  if (input.travel_required) reasons.push('Travel required');
  if (input.weekend_required) reasons.push('Weekend work required');
  if (input.on_call_required) reasons.push('On-call work required');
  return { eligible: reasons.length === 0, reasons };
}

export function createJob(db, input) {
  const screening = screenJob(input);
  const status = screening.eligible ? 'Reviewing' : 'Rejected';
  const result = db.prepare(`
    INSERT INTO job_applications
      (company, role, source_url, salary_min, salary_max, remote_type, travel_required,
       weekend_required, on_call_required, status, notes, rejection_reason, next_action_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.company.trim(), input.role.trim(), input.source_url.trim(),
    Number(input.salary_min) || null, Number(input.salary_max) || null,
    input.remote_type || 'Remote', Number(Boolean(input.travel_required)),
    Number(Boolean(input.weekend_required)), Number(Boolean(input.on_call_required)),
    status, String(input.notes || '').trim(), screening.reasons.join('; '), input.next_action_date || null
  );
  return getJob(db, Number(result.lastInsertRowid));
}

export function getJob(db, id) {
  return db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id) ?? null;
}

export function listJobs(db, filters = {}) {
  const conditions = [];
  const values = [];
  if (filters.status) { conditions.push('status = ?'); values.push(filters.status); }
  if (filters.search) {
    conditions.push('(company LIKE ? OR role LIKE ? OR notes LIKE ?)');
    const term = `%${filters.search}%`; values.push(term, term, term);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM job_applications ${where} ORDER BY datetime(updated_at) DESC, id DESC`).all(...values);
}

export function updateJob(db, id, input) {
  const current = getJob(db, id);
  if (!current) return null;
  const status = input.status ?? current.status;
  if (!allowedJobStatuses.has(status)) throw new Error('Job status is invalid');
  db.prepare(`
    UPDATE job_applications SET status = ?, notes = ?, next_action_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, input.notes ?? current.notes, input.next_action_date ?? current.next_action_date, id);
  return getJob(db, id);
}

export function getJobMetrics(db) {
  const row = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'Reviewing' THEN 1 ELSE 0 END) AS reviewing,
      SUM(CASE WHEN status = 'Ready to Apply' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN status = 'Applied' THEN 1 ELSE 0 END) AS applied,
      SUM(CASE WHEN status = 'Interview' THEN 1 ELSE 0 END) AS interviews
    FROM job_applications WHERE status != 'Rejected'
  `).get();
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]));
}

export function validateTicket(input, partial = false) {
  const errors = [];
  const required = ['customer', 'email', 'subject', 'description'];
  if (!partial) {
    for (const field of required) {
      if (!String(input[field] ?? '').trim()) errors.push(`${field} is required`);
    }
  }
  if (input.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    errors.push('email must be valid');
  }
  if (input.status !== undefined && !allowedStatuses.has(input.status)) {
    errors.push('status is invalid');
  }
  if (input.priority !== undefined && !allowedPriorities.has(input.priority)) {
    errors.push('priority is invalid');
  }
  return errors;
}

export function createTicket(db, input) {
  const status = input.status ?? 'Open';
  const priority = input.priority ?? 'Medium';
  const result = db.prepare(`
    INSERT INTO tickets (customer, email, subject, description, status, priority)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.customer.trim(), input.email.trim(), input.subject.trim(),
    input.description.trim(), status, priority
  );
  const id = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO ticket_events (ticket_id, message) VALUES (?, ?)')
    .run(id, `Ticket created with ${priority.toLowerCase()} priority`);
  return getTicket(db, id);
}

export function listTickets(db, filters = {}) {
  const conditions = [];
  const values = [];
  if (filters.status) {
    conditions.push('status = ?');
    values.push(filters.status);
  }
  if (filters.priority) {
    conditions.push('priority = ?');
    values.push(filters.priority);
  }
  if (filters.search) {
    conditions.push('(customer LIKE ? OR email LIKE ? OR subject LIKE ? OR description LIKE ?)');
    const term = `%${filters.search}%`;
    values.push(term, term, term, term);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`
    SELECT * FROM tickets ${where}
    ORDER BY
      CASE priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
      datetime(updated_at) DESC,
      id DESC
  `).all(...values);
}

export function getTicket(db, id) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return null;
  ticket.events = db.prepare(
    'SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY datetime(created_at) DESC, id DESC'
  ).all(id);
  return ticket;
}

export function updateTicket(db, id, input) {
  const current = getTicket(db, id);
  if (!current) return null;
  const next = {
    status: input.status ?? current.status,
    priority: input.priority ?? current.priority,
    description: input.description?.trim() ?? current.description
  };
  db.prepare(`
    UPDATE tickets SET status = ?, priority = ?, description = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(next.status, next.priority, next.description, id);
  if (next.status !== current.status) {
    db.prepare('INSERT INTO ticket_events (ticket_id, message) VALUES (?, ?)')
      .run(id, `Status changed from ${current.status} to ${next.status}`);
  }
  if (next.priority !== current.priority) {
    db.prepare('INSERT INTO ticket_events (ticket_id, message) VALUES (?, ?)')
      .run(id, `Priority changed from ${current.priority} to ${next.priority}`);
  }
  return getTicket(db, id);
}

export function addNote(db, id, message) {
  if (!getTicket(db, id)) return null;
  db.prepare('INSERT INTO ticket_events (ticket_id, message) VALUES (?, ?)').run(id, message.trim());
  db.prepare('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  return getTicket(db, id);
}

export function getMetrics(db) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status = 'Waiting' THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) AS resolved,
      SUM(CASE WHEN priority = 'Urgent' AND status != 'Resolved' THEN 1 ELSE 0 END) AS urgent
    FROM tickets
  `).get();
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]));
}
