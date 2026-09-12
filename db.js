import { DatabaseSync } from 'node:sqlite';

const allowedStatuses = new Set(['Open', 'In Progress', 'Waiting', 'Resolved']);
const allowedPriorities = new Set(['Low', 'Medium', 'High', 'Urgent']);

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
  `);
  return db;
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
