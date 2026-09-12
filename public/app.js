const list = document.querySelector('#ticket-list');
const detail = document.querySelector('#detail');
const dialog = document.querySelector('#ticket-dialog');
const form = document.querySelector('#ticket-form');
let selectedId = null;

async function api(path, options) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.errors?.join(', ') || data.error || 'Request failed');
  return data;
}

const formatDate = value => new Intl.DateTimeFormat('en-US', { dateStyle:'medium', timeStyle:'short' }).format(new Date(`${value}Z`));

async function refresh() {
  const params = new URLSearchParams();
  const search = document.querySelector('#search').value.trim();
  const status = document.querySelector('#status-filter').value;
  const priority = document.querySelector('#priority-filter').value;
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  const [tickets, metrics] = await Promise.all([api(`/api/tickets?${params}`), api('/api/metrics')]);
  document.querySelector('#metrics').innerHTML = [
    ['Total',metrics.total],['Open',metrics.open],['In progress',metrics.in_progress],['Waiting',metrics.waiting],['Urgent active',metrics.urgent]
  ].map(([name,value]) => `<div class="metric"><strong>${value}</strong><span>${name}</span></div>`).join('');
  list.innerHTML = tickets.length ? tickets.map(ticket => `
    <button class="ticket ${ticket.id === selectedId ? 'active' : ''}" data-id="${ticket.id}">
      <div><h3>${escapeHtml(ticket.subject)}</h3><p>#${ticket.id} · ${escapeHtml(ticket.customer)}</p></div>
      <div class="badges"><span class="badge ${ticket.priority}">${ticket.priority}</span><span class="badge ${ticket.status}">${ticket.status}</span></div>
      <p>Updated ${formatDate(ticket.updated_at)}</p>
    </button>`).join('') : '<p class="empty-list">No tickets match these filters.</p>';
}

function escapeHtml(value) {
  const element = document.createElement('div'); element.textContent = value; return element.innerHTML;
}

async function showTicket(id) {
  selectedId = Number(id);
  const ticket = await api(`/api/tickets/${id}`);
  detail.classList.remove('empty');
  detail.innerHTML = `
    <span class="eyebrow">TICKET #${ticket.id}</span><h2>${escapeHtml(ticket.subject)}</h2>
    <p><strong>${escapeHtml(ticket.customer)}</strong><br><a href="mailto:${escapeHtml(ticket.email)}">${escapeHtml(ticket.email)}</a></p>
    <div class="detail-grid">
      <label>Status<select id="detail-status">${['Open','In Progress','Waiting','Resolved'].map(v=>`<option ${v===ticket.status?'selected':''}>${v}</option>`).join('')}</select></label>
      <label>Priority<select id="detail-priority">${['Low','Medium','High','Urgent'].map(v=>`<option ${v===ticket.priority?'selected':''}>${v}</option>`).join('')}</select></label>
    </div>
    <p class="description">${escapeHtml(ticket.description)}</p>
    <div class="note-row"><input id="note" placeholder="Add an internal note"><button id="add-note" class="secondary">Add</button></div>
    <h3>Activity</h3><ul class="timeline">${ticket.events.map(e=>`<li>${escapeHtml(e.message)}<small>${formatDate(e.created_at)}</small></li>`).join('')}</ul>`;
  await refresh();
  document.querySelector('#detail-status').addEventListener('change', event => changeTicket({ status:event.target.value }));
  document.querySelector('#detail-priority').addEventListener('change', event => changeTicket({ priority:event.target.value }));
  document.querySelector('#add-note').addEventListener('click', addNote);
}

async function changeTicket(change) { await api(`/api/tickets/${selectedId}`, { method:'PATCH', body:JSON.stringify(change) }); await showTicket(selectedId); }
async function addNote() {
  const input = document.querySelector('#note'); if (!input.value.trim()) return;
  await api(`/api/tickets/${selectedId}/notes`, { method:'POST', body:JSON.stringify({ message:input.value }) }); await showTicket(selectedId);
}

document.querySelector('#new-ticket').addEventListener('click', () => dialog.showModal());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
list.addEventListener('click', event => { const ticket = event.target.closest('[data-id]'); if (ticket) showTicket(ticket.dataset.id); });
['search','status-filter','priority-filter'].forEach(id => document.querySelector(`#${id}`).addEventListener(id==='search'?'input':'change', refresh));
form.addEventListener('submit', async event => {
  event.preventDefault(); const error = document.querySelector('#form-error'); error.textContent='';
  try {
    const ticket = await api('/api/tickets', { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); dialog.close(); await showTicket(ticket.id);
  } catch (e) { error.textContent=e.message; }
});
refresh();
