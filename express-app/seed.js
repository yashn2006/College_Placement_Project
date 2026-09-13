require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function seed() {
  console.log('Starting seed process...');

  const password = 'password123';
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);

  // 1. Insert Users
  const users = [
    { name: 'Head User', email: 'head@test.com', password_hash: hash, role: 'head' },
    { name: 'Volunteer User', email: 'volunteer@test.com', password_hash: hash, role: 'volunteer' },
    { name: 'Student One', email: 'student1@test.com', password_hash: hash, role: 'student' },
    { name: 'Student Two', email: 'student2@test.com', password_hash: hash, role: 'student' }
  ];

  const { data: insertedUsers, error: userError } = await supabase
    .from('users')
    .insert(users)
    .select();

  if (userError) throw userError;

  // 2. Insert Students
  const students = insertedUsers
    .filter(u => u.role === 'student')
    .map((u, i) => ({
      id: u.id,
      roll_no: `STUDENT00${i + 1}`,
      branch: 'Computer Science',
      cgpa: 8.0 + i * 0.5,
      resume_url: 'https://example.com/resume.pdf'
    }));

  const { error: studentError } = await supabase.from('students').insert(students);
  if (studentError) throw studentError;

  // 3. Insert Companies
  const companies = [
    { name: 'Google', description: 'Tech giant', website: 'https://google.com' },
    { name: 'Microsoft', description: 'Software company', website: 'https://microsoft.com' },
    { name: 'Amazon', description: 'E-commerce and cloud', website: 'https://amazon.com' },
    { name: 'Meta', description: 'Social media', website: 'https://meta.com' }
  ];

  const { data: insertedCompanies, error: compError } = await supabase
    .from('companies')
    .insert(companies)
    .select();
  
  if (compError) throw compError;

  // 4. Insert Jobs
  const jobs = [];
  const head = insertedUsers.find(u => u.role === 'head');

  insertedCompanies.forEach(company => {
    jobs.push({
      company_id: company.id,
      title: `${company.name} Software Engineer`,
      type: 'job',
      description: 'Full-time position',
      ctc_or_stipend: '15LPA',
      deadline: '2026-12-31',
      posted_by: head.id
    });
    jobs.push({
      company_id: company.id,
      title: `${company.name} Intern`,
      type: 'internship',
      description: 'Summer internship',
      ctc_or_stipend: '50k/mo',
      deadline: '2026-12-31',
      posted_by: head.id
    });
  });

  const { error: jobError } = await supabase.from('jobs').insert(jobs);
  if (jobError) throw jobError;

  console.log('Seed completed successfully!');
  console.table(insertedUsers.map(u => ({ email: u.email, role: u.role, password })));
}

seed().catch(console.error);
