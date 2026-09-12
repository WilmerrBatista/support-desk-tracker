# Support Desk Tracker

A lightweight customer support dashboard for creating, prioritizing, searching, and resolving tickets. It demonstrates practical full-stack skills that connect software development with technical support work.

## Features

- Create and validate customer support tickets
- Filter by status and priority or search ticket content
- Update ticket status and priority from the detail view
- Add internal notes with a complete activity timeline
- Track open, waiting, resolved, and urgent ticket metrics
- Persist records in SQLite without an external database service
- Responsive interface for desktop and mobile screens
- Job pipeline that screens out hybrid, travel, weekend, on-call, and sub-$50,000 roles
- Application stages, duplicate URL protection, and next-action dates

## Built with

- Node.js HTTP server and REST API
- SQLite using Node's built-in database module
- HTML, CSS, and browser JavaScript
- Node's built-in test runner

## Run locally

Node.js 22.5 or newer is required.

```bash
npm start
```

Open `http://localhost:3000` in a browser. The SQLite database is created automatically on first run.

## Test

```bash
npm test
```

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/tickets` | List and filter tickets |
| `POST` | `/api/tickets` | Create a ticket |
| `GET` | `/api/tickets/:id` | Retrieve a ticket and its activity |
| `PATCH` | `/api/tickets/:id` | Update status, priority, or description |
| `POST` | `/api/tickets/:id/notes` | Add an internal note |
| `GET` | `/api/metrics` | Retrieve dashboard totals |
| `GET` | `/api/jobs` | List and search job opportunities |
| `POST` | `/api/jobs` | Screen and save a job posting |
| `PATCH` | `/api/jobs/:id` | Update an application stage or follow-up date |

## Why I built it

I built this project to combine my customer support background with my computer science studies. The app models the ticket triage, documentation, escalation, and follow-through used in a real support workflow.
