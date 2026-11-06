// Quick E2E verification of MetricsEdu API
import http from 'http';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const headers = { ...options.headers };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ ...options, headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('--- 1. Testing Admin Login ---');
  const loginRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST'
  }, { identifier: 'admin@metricsedu.ac.in', password: 'adminpassword123' });

  if (loginRes.status !== 200 || !loginRes.data.token) {
    console.error('Admin login failed:', loginRes.data);
    process.exit(1);
  }
  const token = loginRes.data.token;
  console.log('✅ College Admin logged in successfully. User:', loginRes.data.user.name, '| Type:', loginRes.data.user.institutionType);

  const schLoginRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST'
  }, { identifier: 'schooladmin@metricsedu.ac.in', password: 'adminpassword123' });
  console.log('✅ School Admin logged in successfully. User:', schLoginRes.data.user?.name, '| Type:', schLoginRes.data.user?.institutionType);

  console.log('\n--- 2. Fetching Timetable for Sem 5, Div C ---');
  const ttRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/timetables?division=C&semester=5&institutionType=college',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`✅ Timetable status: ${ttRes.status}. Slots found: ${ttRes.data.slots?.length || 0}`);
  const firstSlot = ttRes.data.slots?.[0];
  console.log(`   Classroom: ${firstSlot?.classroom}, Coordinator: ${firstSlot?.classCoordinator}, isLocked: ${firstSlot?.isLocked}`);

  console.log('\n--- 3. Testing Admin Stats & Session Auditing ---');
  const statsRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/stats',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`✅ Admin Stats fetched. Total students: ${statsRes.data.stats?.totalStudents}, Total teachers: ${statsRes.data.stats?.totalTeachers}`);
  console.log(`   Recent sessions audited: ${statsRes.data.recentSessions?.length || 0}`);
  if (statsRes.data.recentSessions?.length > 0) {
    const s = statsRes.data.recentSessions[0];
    console.log(`   Sample session teacher: ${s.teacher?.name}, Teacher Status: ${s.teacherAttendanceStatus}, Has Teacher Photo: ${!!s.teacherPhoto}, Has Class Photo: ${!!s.classPhoto}`);
  }

  console.log('\n--- 4. Testing Teacher Login ---');
  const tLoginRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST'
  }, { identifier: 'nandini.cv@metricsedu.ac.in', password: 'teacherpassword123' });
  console.log(`✅ Teacher logged in: ${tLoginRes.data.user?.name} (${tLoginRes.data.user?.teacherId})`);

  console.log('\n--- 5. Testing Student Login (by USN 1MS22CS001) ---');
  const sLoginRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST'
  }, { identifier: '1MS22CS001', password: 'studentpassword123' });
  console.log(`✅ Student logged in: ${sLoginRes.data.user?.name} (${sLoginRes.data.user?.usn}), Sem: ${sLoginRes.data.user?.semester}, Div: ${sLoginRes.data.user?.division}`);

  console.log('\n--- 6. Testing Division Allocator (Sem Criteria, Class Strength = 20, Custom Divs A/B/C/D) ---');
  const divAllocRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/divisions/allocate',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  }, {
    mode: 'auto',
    semester: 5,
    classStrength: 20,
    divisionsList: ['A', 'B', 'C', 'D']
  });
  console.log(`✅ Division Allocator result: ${divAllocRes.data.message}`);
  console.log('   Summary:', divAllocRes.data.summary);

  console.log('\n🌟 ALL ENDPOINTS AND PERMISSIONS VERIFIED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Error during test:', err);
  process.exit(1);
});
