const http = require('http');
const url = require('url');
const querystring = require('querystring');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: '../express-app/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const sessions = new Map();

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, value] = cookie.split('=').map(c => c.trim());
    acc[name] = value;
    return acc;
  }, {});
}

function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies.sessionId;
  return sessions.get(sessionId) || null;
}

function requireRole(user, ...roles) {
  return user && roles.includes(user.role);
}

const renderLayout = (content, user) => `
<!DOCTYPE html>
<html>
<head>
    <title>Placement System (HTTP App)</title>
    <style>
        :root {
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --danger: #ef4444;
            --bg: #f8fafc;
            --card: #ffffff;
            --border: #e2e8f0;
            --text: #0f172a;
            --text-muted: #64748b;
            --success: #22c55e;
        }
        * { box-sizing: border-box; }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: var(--bg); color: var(--text); line-height: 1.5; margin: 0; min-height: 100vh; }
        nav { background: var(--primary); border-bottom: 1px solid var(--primary-hover); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10; }
        nav a { color: white; font-weight: 500; text-decoration: none; margin-right: 1.5rem; transition: opacity 0.2s; opacity: 0.9; }
        nav a:hover { opacity: 1; text-decoration: underline; }
        .container { max-width: 1000px; margin: 2rem auto; padding: 0 1.5rem; }
        h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.025em; margin-bottom: 1.5rem; }
        h2 { font-size: 1.5rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; }
        .card { background: var(--card); border: 1px solid var(--border); padding: 1.5rem; border-radius: 12px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1); margin-bottom: 1.5rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: var(--card); border-radius: 12px; overflow: hidden; }
        th { background: #f1f5f9; font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
        th, td { text-align: left; padding: 1rem; border-bottom: 1px solid var(--border); }
        .btn { display: inline-flex; align-items: center; justify-content: center; padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-danger { background: var(--danger); color: white; }
        .btn-danger:hover { background: #dc2626; }
        .btn:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed; }
        input, select, textarea { display: block; width: 100%; padding: 0.625rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1rem; font-family: inherit; font-size: 0.875rem; transition: border-color 0.2s; }
        input:focus, select:focus, textarea:focus { outline: 2px solid var(--primary); border-color: transparent; }
    </style>
</head>
<body>
    <nav>
        <div>
            <a href="/">Home</a>
            <a href="/companies">Companies</a>
            <a href="/jobs">Jobs</a>
        </div>
        <div>
            ${user ? `<span style="color: white; margin-right: 1rem;">${user.email} (${user.role})</span> <a href="/dashboard/${user.role}">Dashboard</a> <form action="/logout" method="POST" style="display:inline;"><button type="submit" class="btn" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;">Logout</button></form>` : '<a href="/login">Login</a>'}
        </div>
    </nav>
    <main class="container">${content}</main>
</body>
</html>
`;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;
  const user = getSessionUser(req);

  const getBody = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(querystring.parse(body)));
  });

  if (path === '/' && method === 'GET') {
    const { count: companiesCount, error: err1 } = await supabase.from('companies').select('*', { count: 'exact', head: true });
    if (err1) console.error('SUPABASE ERROR in GET /:', err1);
    const { count: jobsCount, error: err2 } = await supabase.from('jobs').select('*', { count: 'exact', head: true });
    if (err2) console.error('SUPABASE ERROR in GET /:', err2);
    const { count: studentsCount, error: err3 } = await supabase.from('students').select('*', { count: 'exact', head: true });
    if (err3) console.error('SUPABASE ERROR in GET /:', err3);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`
      <h1>Welcome to Placement System</h1>
      <p>Total Companies: ${companiesCount || 0}</p>
      <p>Total Students: ${studentsCount || 0}</p>
      <p>Total Jobs: ${jobsCount || 0}</p>
    `, user));
  }
  else if (path === '/login' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`
      <h1>Login</h1>
      <div class="card" style="background: #f1f5f9; margin-bottom: 1rem; font-size: 0.875rem;">
          <strong>Test Accounts:</strong><br>
          Head: head@test.com / password123<br>
          Volunteer: volunteer@test.com / password123<br>
          Student: student1@test.com / password123
      </div>
      <form action="/login" method="POST">
        Email: <input type="email" name="email" required><br>
        Password: <input type="password" name="password" required><br>
        <button type="submit">Login</button>
      </form>
    `, user));
  }
  else if (path === '/login' && method === 'POST') {
    const { email, password } = await getBody(req);
    const { data: userRecord, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error) console.error('SUPABASE ERROR in POST /login:', error);
    
    if (userRecord && await bcrypt.compare(password, userRecord.password_hash)) {
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, userRecord);
      res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/`);
      res.writeHead(302, { 'Location': `/dashboard/${userRecord.role}` });
      return res.end();
    }
    res.writeHead(401, { 'Content-Type': 'text/plain' }); 
    res.end('Invalid');
  }
  else if (path === '/logout' && method === 'POST') {
    const cookies = parseCookies(req.headers.cookie || '');
    sessions.delete(cookies.sessionId);
    res.setHeader('Set-Cookie', 'sessionId=; HttpOnly; Path=/; Max-Age=0');
    res.writeHead(302, { 'Location': '/' });
    res.end();
  }
  else if (path === '/companies' && method === 'GET') {
    if (!user) { res.writeHead(302, {'Location':'/login'}); return res.end(); }
    const { data: companies, error } = await supabase.from('companies').select('*');
    if (error) console.error('SUPABASE ERROR in GET /companies:', error);
    const safeCompanies = companies || [];
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const companyList = safeCompanies.map(c => `<div class="card"><h3><a href="/company/${c.id}">${c.name}</a></h3></div>`).join('');
    res.end(renderLayout(`<h1>Companies</h1>${companyList}`, user));
  }
  else if (path.startsWith('/company/') && method === 'GET') {
    const id = path.split('/')[2];
    const { data: company, error: err1 } = await supabase.from('companies').select('*').eq('id', id).single();
    if (err1) console.error('SUPABASE ERROR in GET /company/:id:', err1);
    if (!company) { res.writeHead(404); return res.end('Company Not Found'); }

    const { data: companyJobs, error: err2 } = await supabase.from('jobs').select('*').eq('company_id', id);
    if (err2) console.error('SUPABASE ERROR in GET /company/:id (jobs):', err2);
    const safeJobs = companyJobs || [];

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`<h1>${company.name}</h1><ul>${safeJobs.map(j => `<li>${j.title}</li>`).join('')}</ul>`, user));
  }
  else if (path === '/students' && method === 'GET') {
    if (!user || !requireRole(user, 'head', 'volunteer')) { res.writeHead(403); return res.end('Denied'); }
    const { data: students, error } = await supabase.from('students').select('*, users(*)');
    if (error) console.error('SUPABASE ERROR in GET /students:', error);
    const safeStudents = students || [];
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`<h1>Students</h1><ul>${safeStudents.map(s => `<li>${s.users.name} - ${s.roll_no}</li>`).join('')}</ul>`, user));
  }
  else if (path.startsWith('/student/') && method === 'GET') {
    const id = path.split('/')[2];
    if (!user || !(requireRole(user, 'head', 'volunteer') || user.id === id)) { res.writeHead(403); return res.end('Denied'); }
    const { data: student, error: err1 } = await supabase.from('students').select('*, users(name)').eq('id', id).single();
    if (err1) console.error('SUPABASE ERROR in GET /student/:id:', err1);
    if (!student) { res.writeHead(404); return res.end('Student Not Found'); }

    const { data: apps, error: err2 } = await supabase.from('applications').select('*, jobs(*, companies(*))').eq('student_id', id);
    if (err2) console.error('SUPABASE ERROR in GET /student/:id (apps):', err2);
    const safeApps = apps || [];
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`<h1>${student.users.name}</h1><p>Roll No: ${student.roll_no}</p><h2>Applications</h2><ul>${safeApps.map(a => `<li>${a.jobs.title} (${a.status})</li>`).join('')}</ul>`, user));
  }
  else if (path === '/jobs' && method === 'GET') {
    if (!user) { res.writeHead(302, {'Location':'/login'}); return res.end(); }
    let query = supabase.from('jobs').select('*, companies(*)');
    if (parsedUrl.query.type) query = query.eq('type', parsedUrl.query.type);
    const { data: jobs, error } = await query;
    if (error) console.error('SUPABASE ERROR in GET /jobs:', error);
    const safeJobs = jobs || [];
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`<h1>Jobs</h1><ul>${safeJobs.map(j => `<li><a href="/job/${j.id}">${j.title}</a> (${j.type}) - ${j.companies.name}</li>`).join('')}</ul>`, user));
  }
  else if (path.startsWith('/job/') && method === 'GET') {
    const id = path.split('/')[2];
    if (!user) { res.writeHead(302, {'Location':'/login'}); return res.end(); }
    const { data: job, error: err1 } = await supabase.from('jobs').select('*, companies(*)').eq('id', id).single();
    if (err1) console.error('SUPABASE ERROR in GET /job/:id:', err1);
    if (!job) { res.writeHead(404); return res.end('Job Not Found'); }
    let hasApplied = false;
    if (user.role === 'student' || user.role === 'volunteer') {
        const { data: app, error: err2 } = await supabase.from('applications').select('id').eq('job_id', id).eq('student_id', user.id).single();
        if (err2 && err2.code !== 'PGRST116') console.error('SUPABASE ERROR in GET /job/:id (app):', err2);
        if (app) hasApplied = true;
    }
    const canDelete = user.role === 'head' || (user.role === 'volunteer' && job.posted_by === user.id);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`
        <h1>${job.title}</h1>
        <p><strong>Company:</strong> ${job.companies.name}</p>
        <p><strong>Description:</strong> ${job.description}</p>
        <p><strong>CTC/Stipend:</strong> ${job.ctc_or_stipend}</p>
        ${(user.role === 'student' || user.role === 'volunteer') ? (hasApplied ? `<button class="btn" disabled>Already Applied</button>` : `<form action="/job/${job.id}/apply" method="POST"><button type="submit" class="btn btn-primary">Apply Now</button></form>`) : ''}
        ${canDelete ? `<form action="/job/${job.id}/delete" method="POST" onsubmit="return confirm('Are you sure?');"><button type="submit" class="btn btn-danger">Delete Job</button></form>` : ''}
    `, user));
  }
  else if (path === '/dashboard/head' && method === 'GET') {
    if (!user) { res.writeHead(302, {'Location':'/login'}); return res.end(); }
    if (!requireRole(user, 'head')) { res.writeHead(403); return res.end('Access Denied'); }
    const { data: apps, error: err1 } = await supabase
      .from('applications')
      .select('*, jobs(*, companies(*)), users!applications_student_id_fkey(*)');
    if (err1) console.error('SUPABASE ERROR in GET /dashboard/head:', err1);
    const safeApps = apps || [];
    
    const { data: companies, error: err2 } = await supabase.from('companies').select('*');
    if (err2) console.error('SUPABASE ERROR in GET /dashboard/head:', err2);
    const safeCompanies = companies || [];
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`
        <h1>Head Dashboard</h1>
        <h2>Applications</h2>
        <table>
            <tr><th>Student</th><th>Job</th><th>Status</th><th>Action</th></tr>
            ${safeApps.map(a => `<tr>
                <td>${a.users ? a.users.name : 'Unknown'}</td>
                <td>${a.jobs.title}</td>
                <td>${a.status === 'pending' ? 'Pending' : (a.status === 'approved' ? '<span style="color:green">Approved</span>' : '<span style="color:red">Rejected</span>')}</td>
                <td>
                    ${a.status === 'pending' ? `
                        <form action="/application/${a.id}/decide" method="POST" style="display:inline;"><input type="hidden" name="status" value="approved"><button type="submit" class="btn btn-primary">Approve</button></form>
                        <form action="/application/${a.id}/decide" method="POST" style="display:inline;"><input type="hidden" name="status" value="rejected"><button type="submit" class="btn btn-danger">Reject</button></form>
                    ` : ''}
                </td>
            </tr>`).join('')}
        </table>
        <h2>Post Job</h2>
        <div class="card">
            <form action="/job" method="POST">
                <select name="company_id">${safeCompanies.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
                <input name="title" placeholder="Title" required>
                <select name="type"><option value="job">Job</option><option value="internship">Internship</option></select>
                <textarea name="description" placeholder="Description"></textarea>
                <input name="ctc_or_stipend" placeholder="CTC/Stipend">
                <input name="eligibility" placeholder="Eligibility">
                <input type="date" name="deadline">
                <button type="submit" class="btn btn-primary">Post</button>
            </form>
        </div>
    `, user));
  }
  else if (path === '/dashboard/volunteer' && method === 'GET') {
    if (!user) { res.writeHead(302, {'Location':'/login'}); return res.end(); }
    if (!requireRole(user, 'volunteer')) { res.writeHead(403); return res.end('Access Denied'); }
    
    const { data: companies, error: compError } = await supabase.from('companies').select('*');
    if (compError) console.error('SUPABASE ERROR in GET /dashboard/volunteer (companies):', compError);
    const safeCompanies = companies || [];
    
    const { data: myApplications, error: myAppError } = await supabase
      .from('applications')
      .select('*, jobs(*, companies(*))')
      .eq('student_id', user.id);
    if (myAppError) console.error('SUPABASE ERROR in GET /dashboard/volunteer (my-apps):', myAppError);
    const safeMyApps = myApplications || [];

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`
        <h1>Volunteer Dashboard</h1>
        
        <h2>My Applications</h2>
        <table>
            <tr><th>Job</th><th>Company</th><th>Status</th></tr>
            ${safeMyApps.map(a => `<tr>
                <td>${a.jobs.title}</td>
                <td>${a.jobs.companies.name}</td>
                <td>${a.status}</td>
            </tr>`).join('')}
            ${safeMyApps.length === 0 ? '<tr><td colspan="3">You haven\'t applied to any jobs yet.</td></tr>' : ''}
        </table>

        <h2>Post Job</h2>
        <div class="card">
            <form action="/job" method="POST">
                <select name="company_id">${safeCompanies.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
                <input name="title" placeholder="Title" required>
                <select name="type"><option value="job">Job</option><option value="internship">Internship</option></select>
                <textarea name="description" placeholder="Description"></textarea>
                <input name="ctc_or_stipend" placeholder="CTC/Stipend">
                <input name="eligibility" placeholder="Eligibility">
                <input type="date" name="deadline">
                <button type="submit" class="btn btn-primary">Post</button>
            </form>
        </div>
    `, user));
  }
  else if (path === '/dashboard/student' && method === 'GET') {
    if (!user || !requireRole(user, 'student')) { res.writeHead(403); return res.end('Denied'); }
    const { data: myApplications, error: err1 } = await supabase
      .from('applications')
      .select('*, jobs(*, companies(*))')
      .eq('student_id', user.id);
    if (err1) console.error('SUPABASE ERROR in GET /dashboard/student:', err1);
    const safeApps = myApplications || [];
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderLayout(`<h1>My Applications</h1><ul>${safeApps.map(a => `<li>${a.jobs.title} (${a.status})</li>`).join('')}</ul>`, user));
  }
  else if (path === '/job' && method === 'POST') {
    if (!user || !requireRole(user, 'head', 'volunteer')) { res.writeHead(403); return res.end('Denied'); }
    const body = await getBody(req);
    const { error } = await supabase.from('jobs').insert({ ...body, posted_by: user.id });
    if (error) console.error('SUPABASE ERROR in POST /job:', error);
    res.writeHead(302, { 'Location': `/dashboard/${user.role}` });
    res.end();
  }
  else if (path.startsWith('/job/') && path.endsWith('/apply') && method === 'POST') {
    if (!user || !requireRole(user, 'student', 'volunteer')) { res.writeHead(403); return res.end('Denied'); }
    const jobId = path.split('/')[2];
    const { error } = await supabase.from('applications').insert({ job_id: jobId, student_id: user.id, status: 'pending' });
    if (error) console.error('SUPABASE ERROR in POST /job/:id/apply:', error);
    res.writeHead(302, { 'Location': `/job/${jobId}` });
    res.end();
  }
  else if (path.startsWith('/job/') && path.endsWith('/delete') && method === 'POST') {
    const jobId = path.split('/')[2];
    const { data: job, error: err1 } = await supabase.from('jobs').select('posted_by').eq('id', jobId).single();
    if (err1) console.error('SUPABASE ERROR in POST /job/:id/delete (fetch):', err1);
    if (!job || !(requireRole(user, 'head') || (requireRole(user, 'volunteer') && job.posted_by === user.id))) { res.writeHead(403); return res.end('Denied'); }
    const { error: err2 } = await supabase.from('jobs').delete().eq('id', jobId);
    if (err2) console.error('SUPABASE ERROR in POST /job/:id/delete:', err2);
    res.writeHead(302, { 'Location': `/dashboard/${user.role}` });
    res.end();
  }
  else if (path.startsWith('/application/') && path.endsWith('/decide') && method === 'POST') {
      if (!user || !requireRole(user, 'head')) { res.writeHead(403); return res.end('Denied'); }
      const appId = path.split('/')[2];
      const { status } = await getBody(req);
      const { error } = await supabase.from('applications').update({ status, decided_by: user.id }).eq('id', appId);
      if (error) console.error('SUPABASE ERROR in POST /application/:id/decide:', error);
      res.writeHead(302, { 'Location': '/dashboard/head' });
      res.end();
  }
  else if (path === '/company' && method === 'POST') {
      if (!user || !requireRole(user, 'head')) { res.writeHead(403); return res.end('Denied'); }
      const body = await getBody(req);
      const { error } = await supabase.from('companies').insert({...body, created_by: user.id});
      if (error) console.error('SUPABASE ERROR in POST /company:', error);
      res.writeHead(302, { 'Location': '/dashboard/head' });
      res.end();
  }
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const PORT = 3000;
console.log('Server started fresh at', new Date().toISOString());
server.listen(PORT, () => console.log(`HTTP App running at http://localhost:${PORT}`));
