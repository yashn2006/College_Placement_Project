# HTTP App

A minimal Node.js application using only the core `http` module. This application demonstrates manual routing, manual request body parsing, and manual HTML response construction.

## Features
- Manual routing via `req.url` and `req.method`.
- In-memory data storage (no database).
- Manual HTML template strings for views.
- Demonstrates status codes (200, 201, 400, 404).

## Run Instructions

1. Navigate to this directory:
   ```bash
   cd http-app
   ```
2. Run the application:
   ```bash
   npm start
   ```
3. Open your browser and navigate to `http://localhost:3000`.

## API Endpoints
- `GET /` - Home page with stats.
- `GET /companies` - List all companies.
- `GET /company/:id` - Company details and jobs.
- `GET /students` - List all students.
- `GET /student/:id` - Student profile.
- `GET /jobs/:companyName` - Jobs filtered by company name.
- `POST /job` - Create a new job (expects JSON body with `company_id`, `title`, `type`).
