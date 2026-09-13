# College Placement Management System — Build Spec

Feed this whole document to OpenCode as your first prompt/context. It is written so an
agent can build both required implementations without guessing.

---

## 0. Assignment mapping (don't lose marks on this)

Two **separate** apps, both built from this same spec:

- **Implementation A** — `http-app/` — raw Node `http` module only. No Express, no Handlebars,
  no npm framework of any kind. Manual routing via `req.url` / `req.method`, manual status
  codes, responses written as plain HTML strings (or minimal string templates). This one is
  *supposed* to look clunky — that clunkiness is your evidence for the comparison section.
- **Implementation B** — `express-app/` — Express + `hbs` (Handlebars) + `express-session` +
  Supabase (Postgres) as the data layer. This is the "gorgeous" one.

Keep them in **two separate folders with two separate `package.json` files** so they run
independently on different ports (e.g. 3000 for A, 4000 for B).

---

## 1. Roles

Three roles, stored in a `users` table, distinguished by a `role` column:

- `head` — Placement Committee Head / Teacher. Full control: create/edit/delete companies
  and jobs, approve or reject the volunteer role, approve/reject student applications, view
  everything.
- `volunteer` — Placement Committee Volunteer. Can create/edit job postings and view
  applications, but **cannot** approve/reject final application decisions (only `head` can) —
  this gives you a real permissions distinction to demo. Volunteers also cannot delete
  companies.
- `student` — Can view companies/jobs, apply to jobs, view their own application status
  history. Cannot see other students' applications.

Auth: real login with `express-session` + hashed passwords (`bcrypt`). One `users` table for
all three roles, differentiated by `role` field, not three separate tables.

---

## 2. Data model (Supabase / Postgres)

Run this SQL in the Supabase SQL editor before building the app:

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('head','volunteer','student')),
  created_at timestamptz default now()
);

create table students (
  id uuid primary key references users(id) on delete cascade,
  roll_no text unique not null,
  branch text,
  cgpa numeric,
  resume_url text
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  description text,
  website text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  title text not null,
  type text not null check (type in ('job','internship')),
  description text,
  ctc_or_stipend text,
  eligibility text,
  deadline date,
  posted_by uuid references users(id),
  created_at timestamptz default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  applied_at timestamptz default now(),
  decided_by uuid references users(id),
  unique(job_id, student_id)
);
```

Seed data: at least 3 users per role, 4-5 companies, 2-3 jobs per company (mix of `job` and
`internship`), and a handful of applications in different statuses — so every view has
something real to render, including empty-state and conditional cases.

---

## 3. Express app — routes (implements the assignment's required list)

All routes below use `hbs` views. Use a shared `layout.hbs` (navbar changes based on
`req.session.user.role`) and partials for repeated bits (job card, company card, status
badge).

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/` | public | Landing page — stats (total companies, open jobs, placed students) |
| GET | `/login` | public | Login form |
| POST | `/login` | public | Authenticate, create session, redirect by role |
| POST | `/logout` | any | Destroy session |
| GET | `/companies` | logged-in | List all companies — `{{#each}}` over companies |
| GET | `/company/:id` | logged-in | Company detail + its open jobs |
| GET | `/students` | head, volunteer | List registered students |
| GET | `/student/:id` | head, volunteer, or self | Student's profile + their applications |
| GET | `/jobs` | logged-in | All open jobs, filterable by `?type=job` / `?type=internship` |
| GET | `/jobs/:company` | logged-in | Jobs filtered by company name (assignment's required route) |
| GET | `/job/:id` | logged-in | Single job detail + apply button (students only, hidden via `{{#if}}` if already applied or role != student) |
| POST | `/job/:id/apply` | student | Create application row, redirect with flash message |
| GET | `/dashboard/head` | head | Admin dashboard: pending applications to approve/reject, manage companies/jobs |
| GET | `/dashboard/volunteer` | volunteer | Volunteer dashboard: post/edit jobs, view (not decide) applications |
| GET | `/dashboard/student` | student | "My applications" with status badges |
| POST | `/company` | head only | Create company |
| POST | `/job` | head, volunteer | Create job |
| POST | `/application/:id/decide` | head only | Approve or reject (body: `status`) |

**Handlebars features to actually demonstrate (grader will look for these):**
- `{{#each jobs}}...{{/each}}` on `/jobs` and `/company/:id`
- `{{#if}}/{{else}}` — e.g. show "Apply" button only if `role === 'student'` and not already
  applied; show empty-state message with `{{#unless jobs.length}}`
- A custom Handlebars helper, e.g. `{{formatDate deadline}}` or `{{statusBadge status}}`
  (register with `hbs.registerHelper`) — this satisfies "conditional/helper functionality"
  explicitly
- Partials: `{{> jobCard job}}`, `{{> navbar}}`

**Middleware to write:**
- `requireLogin` — redirect to `/login` if no session
- `requireRole(...roles)` — 403 page if role not allowed (use this for head-only routes)

---

## 4. HTTP module app — routes (deliberately minimal, same case study)

No sessions, no auth complexity needed here — keep it simple, in-memory array of data
(hardcoded, no Supabase call needed for this one — the point is contrasting manual routing
pain, not re-implementing the whole DB layer twice).

| Method | Route | Status codes to demonstrate |
|---|---|---|
| GET | `/` | 200 |
| GET | `/companies` | 200 |
| GET | `/company/:id` (parse from `req.url.split('/')`) | 200, or 404 if id not found |
| GET | `/students` | 200 |
| GET | `/student/:id` | 200 / 404 |
| GET | `/jobs/:company` | 200 / 404 if no matching company |
| POST | `/job` (parse body manually via chunks) | 201 on create, 400 if missing fields |
| * | anything unmatched | 404 with plain "Not Found" |

Write responses as plain HTML template strings (function that takes data, returns a string).
No templating engine allowed here — that's the point of the exercise.

---

## 5. Design direction for the Express app (the "gorgeous" part)

Give OpenCode/Gemini this direction explicitly or it'll default to bootstrap-looking boilerplate:

- Modern card-based layouts, generous whitespace, one accent color (e.g. deep indigo or
  teal) + neutral grays, subtle shadows, rounded corners (8-12px), a real font pairing (e.g.
  Inter or Sora for headings via Google Fonts CDN, not default sans-serif)
- Status badges color-coded: pending = amber, approved = green, rejected = red
- Dashboard pages use a sidebar layout (role-based nav items); public pages use a top navbar
- Empty states should have an icon + friendly text, not a blank table
- No inline `style=""` — one `public/css/style.css`, organized by component

---

## 6. Comparison write-up (you write this yourself after building — don't outsource it)

Once both apps run, write ~1 page covering, with your own concrete examples from the two
codebases you just built:
- **Routing**: manual `if (req.url === ...)` chains vs. Express's declarative `app.get()`
- **Code complexity**: line count / boilerplate for parsing params, body, sending headers
- **Maintainability**: adding a new route — how many places did you touch in each?
- **Scalability**: what happens as routes grow to 20+? Middleware reuse in Express vs. none in HTTP module

---

## 7. Prompt to paste into OpenCode

```
Build two separate Node.js apps in two folders, http-app/ and express-app/, per the attached
spec document (placement-system-spec.md). Read the whole spec first.

http-app/: plain Node http module only, no dependencies, in-memory hardcoded data, routes
and status codes exactly as listed in section 4.

express-app/: Express + hbs + express-session + bcrypt + @supabase/supabase-js, routes exactly
as listed in section 3, schema exactly as in section 2 (I will run the SQL in Supabase myself
— just read SUPABASE_URL and SUPABASE_KEY from a .env file, don't hardcode them). Follow the
design direction in section 5. Implement the Handlebars features listed (each, if/unless,
custom helper, partials) — don't skip the custom helper, it's a grading requirement.

Give me a README in each folder with exact run instructions and the npm install command.
```

Paste your Supabase project URL and anon/service key into a `.env` file in `express-app/`
yourself — never let an AI tool put real keys in code it prints back to you.
