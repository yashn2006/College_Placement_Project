require('dotenv').config();
const express = require('express');
const hbs = require('hbs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Express setup
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'placement-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Custom Handlebars Helpers
hbs.registerHelper('formatDate', (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
});

hbs.registerHelper('statusBadge', (status) => {
  let color = 'gray';
  if (status === 'pending') color = 'amber';
  if (status === 'approved') color = 'green';
  if (status === 'rejected') color = 'red';
  
  return new hbs.SafeString(`<span class="badge badge-${color}">${status}</span>`);
});

hbs.registerHelper('eq', function (a, b, options) {
  const isBlock = options && typeof options.fn === 'function';
  const result = a === b;

  if (isBlock) {
    return result ? options.fn(this) : options.inverse(this);
  }
  // Used inline, e.g. {{#if (eq a b)}} or {{eq a b}}
  return result;
});

hbs.registerHelper('or', function (a, b) {
  return a || b;
});

hbs.registerHelper('and', function (a, b) {
  return a && b;
});

hbs.registerHelper('array', function() {
  return Array.from(arguments).slice(0, -1);
});

// Middleware
const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.locals.user = req.session.user;
  next();
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      // Use query param for flash message emulation since no flash lib installed
      return res.redirect(`/dashboard/${req.session.user?.role || ''}?error=Unauthorized`);
    }
    next();
  };
};

// Routes

// GET /
app.get('/', async (req, res) => {
  const { data: companiesCount } = await supabase.from('companies').select('*', { count: 'exact', head: true });
  const { data: jobsCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true });
  const { data: studentsCount } = await supabase.from('students').select('*', { count: 'exact', head: true });

  res.render('index', {
    stats: {
      companies: companiesCount?.length || 0,
      jobs: jobsCount?.length || 0,
      students: studentsCount?.length || 0
    },
    user: req.session.user
  });
});

// GET /login
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard/' + req.session.user.role);
  res.render('login');
});

// POST /login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) {
    return res.render('login', { error: 'Invalid email or password' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.render('login', { error: 'Invalid email or password' });
  }

  req.session.user = user;
  res.redirect(`/dashboard/${user.role}`);
});

// POST /logout
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// GET /companies
app.get('/companies', requireLogin, async (req, res) => {
  const { data: companies } = await supabase.from('companies').select('*');
  res.render('companies', { companies });
});

// GET /company/:id
app.get('/company/:id', requireLogin, async (req, res) => {
  const { data: company } = await supabase.from('companies').select('*').eq('id', req.params.id).single();
  const { data: companyJobs } = await supabase.from('jobs').select('*').eq('company_id', req.params.id);
  res.render('company-detail', { company, jobs: companyJobs });
});

// Add the missing view for /students
app.get('/students', requireLogin, requireRole('head', 'volunteer'), async (req, res) => {
  const { data: students } = await supabase.from('students').select('*, users(*)');
  res.render('students', { students });
});

// GET /student/:id
app.get('/student/:id', requireLogin, async (req, res) => {
  const canAccess = req.session.user.role === 'head' || req.session.user.role === 'volunteer' || req.session.user.id === req.params.id;
  if (!canAccess) return res.status(403).render('error', { message: 'Access Denied' });

  const { data: student } = await supabase.from('students').select('*, users(*)').eq('id', req.params.id).single();
  const { data: applications } = await supabase.from('applications').select('*, jobs(*, companies(*))').eq('student_id', req.params.id);
  res.render('student-profile', { student, applications });
});

// GET /jobs
app.get('/jobs', requireLogin, async (req, res) => {
  let query = supabase.from('jobs').select('*, companies(*)');
  if (req.query.type) {
    query = query.eq('type', req.query.type);
  }
  const { data: jobs } = await query;
  res.render('jobs', { jobs, typeFilter: req.query.type });
});

// GET /jobs/:company
app.get('/jobs/search/:companyName', requireLogin, async (req, res) => {
  const { data: company } = await supabase.from('companies').select('*').ilike('name', `%${req.params.companyName}%`).limit(1).single();
  if (!company) return res.render('jobs', { jobs: [], error: 'Company not found' });
  
  const { data: jobs } = await supabase.from('jobs').select('*, companies(*)').eq('company_id', company.id);
  res.render('jobs', { jobs, companyName: company.name });
});

// GET /job/:id
app.get('/job/:id', requireLogin, async (req, res) => {
  const { data: job } = await supabase.from('jobs').select('*, companies(*)').eq('id', req.params.id).single();
  
  let hasApplied = false;
  if (req.session.user.role === 'student' || req.session.user.role === 'volunteer') {
    const { data: application } = await supabase
      .from('applications')
      .select('*')
      .eq('job_id', req.params.id)
      .eq('student_id', req.session.user.id)
      .single();
    if (application) hasApplied = true;
  }

  res.render('job-detail', { job, hasApplied });
});

// POST /job/:id/apply
app.post('/job/:id/apply', requireLogin, requireRole('student', 'volunteer'), async (req, res) => {
  const { error } = await supabase.from('applications').insert({
    job_id: req.params.id,
    student_id: req.session.user.id,
    status: 'pending'
  });

  if (error) {
    console.error('APPLY INSERT ERROR:', error); // <-- add this
    return res.redirect(`/job/${req.params.id}?error=Already applied`);
  }
  res.redirect(`/job/${req.params.id}?success=Applied successfully`);
});

// Dashboards
app.get('/dashboard/head', requireLogin, requireRole('head'), async (req, res) => {
  const { data: applications, error } = await supabase.from('applications').select('*, jobs(*, companies(*)), users!applications_student_id_fkey(*)');
  if (error) console.error('SUPABASE ERROR in GET /dashboard/head:', error);
  
  const { data: companies, error: compError } = await supabase.from('companies').select('*');
  if (compError) console.error('SUPABASE ERROR in GET /dashboard/head (companies):', compError);
  
  res.render('dashboards/head', { 
    applications: applications || [], 
    companies: companies || [], 
    activePage: 'head' 
  });
});

app.get('/dashboard/volunteer', requireLogin, requireRole('volunteer'), async (req, res) => {
  const { data: companies, error: compError } = await supabase.from('companies').select('*');
  if (compError) console.error('VOLUNTEER DASHBOARD COMPANIES ERROR:', compError);

  const { data: myApplications, error: err2 } = await supabase
    .from('applications')
    .select('*, jobs(*, companies(*))')
    .eq('student_id', req.session.user.id);
  if (err2) console.error('VOLUNTEER DASHBOARD MY-APPS ERROR:', err2);

  res.render('dashboards/volunteer', {
    companies: companies || [],
    myApplications: myApplications || [],
    activePage: 'volunteer'
  });
});

app.get('/dashboard/student', requireLogin, requireRole('student'), async (req, res) => {
  const { data: myApplications, error } = await supabase
    .from('applications')
    .select('*, jobs(*, companies(*))')
    .eq('student_id', req.session.user.id);

  if (error) {
    console.error('Error fetching applications:', error);
  }
  console.log('Session user id:', req.session.user.id);
  console.log('myApplications:', myApplications);

  res.render('dashboards/student', { myApplications: myApplications || [] });
});

// POST /company
app.post('/company', requireLogin, requireRole('head'), async (req, res) => {
  const { name, description, website, logo_url } = req.body;
  await supabase.from('companies').insert({ name, description, website, logo_url, created_by: req.session.user.id });
  res.redirect('/dashboard/head');
});

// POST /job
app.post('/job', requireLogin, requireRole('head', 'volunteer'), async (req, res) => {
  const { company_id, title, type, description, ctc_or_stipend, eligibility, deadline } = req.body;
  await supabase.from('jobs').insert({
    company_id, title, type, description, ctc_or_stipend, eligibility, deadline,
    posted_by: req.session.user.id
  });
  res.redirect(`/dashboard/${req.session.user.role}`);
});
app.post('/application/:id/decide', requireLogin, requireRole('head'), async (req, res) => {
  const { status } = req.body;
  const { error } = await supabase
    .from('applications')
    .update({
      status,
      decided_by: req.session.user.id
    })
    .eq('id', req.params.id);
  if (error) console.error('DECIDE APPLICATION ERROR:', error);
  res.redirect('/dashboard/head');
});

// POST /job/:id/delete
app.post('/job/:id/delete', requireLogin, requireRole('head', 'volunteer'), async (req, res) => {
  const { data: job } = await supabase.from('jobs').select('posted_by').eq('id', req.params.id).single();

  if (!job) return res.redirect(`/jobs?error=Job not found`);

  // Authorization check
  const isHead = req.session.user.role === 'head';
  const isOwner = job.posted_by === req.session.user.id;

  if (!isHead && !isOwner) {
    return res.redirect(`/job/${req.params.id}?error=Unauthorized`);
  }

  const { error } = await supabase.from('jobs').delete().eq('id', req.params.id);

  if (error) {
    console.error('Delete error:', error);
    return res.redirect(`/job/${req.params.id}?error=Delete failed`);
  }

  res.redirect(`/dashboard/${req.session.user.role}`);
});

app.listen(PORT, () => {
  console.log(`Express App running at http://localhost:${PORT}`);
});
