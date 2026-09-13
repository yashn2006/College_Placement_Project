# Express App

A feature-rich College Placement Management System built with Express.js, Handlebars (hbs), Supabase (PostgreSQL), and session-based authentication.

## Features
- Role-based access control (Head, Volunteer, Student).
- Secure authentication with `bcrypt` and `express-session`.
- Database integration with Supabase.
- Modern, card-based responsive UI with a sidebar dashboard.
- Handlebars partials, custom helpers (`formatDate`, `statusBadge`, `eq`, `includes`).

## Run Instructions

1. **Prerequisites**: Ensure you have Node.js installed.
2. **Setup Environment**:
   - Create a `.env` file in this directory based on the requirements:
     ```env
     SUPABASE_URL=your_supabase_url_here
     SUPABASE_KEY=your_supabase_anon_key_here
     PORT=4000
     ```
3. **Install Dependencies**:
   ```bash
   npm install
   ```
4. **Run the application**:
   ```bash
   npm start
   ```
5. Open your browser to `http://localhost:4000`.
