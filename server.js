import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addNote, createDatabase, createTicket, getMetrics, getTicket,
  listTickets, updateTicket, validateTicket
} from './db.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const db = createDatabase(process.env.DB_PATH || join(root, 'support-desk.db'));
const port = Number(process.env.PORT || 3000);

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};

async function jsonBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request is too large');
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw new Error('Request body must be valid JSON'); }
}

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ticketMatch = url.pathname.match(/^\/api\/tickets\/(\d+)$/);
    const noteMatch = url.pathname.match(/^\/api\/tickets\/(\d+)\/notes$/);

    if (req.method === 'GET' && url.pathname === '/api/tickets') {
      return send(res, 200, listTickets(db, Object.fromEntries(url.searchParams)));
    }
    if (req.method === 'GET' && url.pathname === '/api/metrics') {
      return send(res, 200, getMetrics(db));
    }
    if (req.method === 'GET' && ticketMatch) {
      const ticket = getTicket(db, Number(ticketMatch[1]));
      return ticket ? send(res, 200, ticket) : send(res, 404, { error: 'Ticket not found' });
    }
    if (req.method === 'POST' && url.pathname === '/api/tickets') {
      const input = await jsonBody(req);
      const errors = validateTicket(input);
      return errors.length ? send(res, 400, { errors }) : send(res, 201, createTicket(db, input));
    }
    if (req.method === 'PATCH' && ticketMatch) {
      const input = await jsonBody(req);
      const errors = validateTicket(input, true);
      if (errors.length) return send(res, 400, { errors });
      const ticket = updateTicket(db, Number(ticketMatch[1]), input);
      return ticket ? send(res, 200, ticket) : send(res, 404, { error: 'Ticket not found' });
    }
    if (req.method === 'POST' && noteMatch) {
      const input = await jsonBody(req);
      if (!String(input.message ?? '').trim()) return send(res, 400, { error: 'Note cannot be empty' });
      const ticket = addNote(db, Number(noteMatch[1]), input.message);
      return ticket ? send(res, 201, ticket) : send(res, 404, { error: 'Ticket not found' });
    }
    if (req.method === 'GET') {
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (relative.includes('..')) return send(res, 403, 'Forbidden', 'text/plain');
      try {
        const file = await readFile(join(root, 'public', relative));
        return send(res, 200, file, types[extname(relative)] || 'application/octet-stream');
      } catch {}
    }
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    send(res, 400, { error: error.message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(port, () => console.log(`Support Desk running at http://localhost:${port}`));
}
