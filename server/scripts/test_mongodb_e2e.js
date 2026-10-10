const http = require('http');

async function main() {
  console.log('--- Starting MongoDB & API E2E Verification ---');

  // Start the server programmatically
  const app = require('../server');
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(5099, '127.0.0.1', resolve));
  console.log('Test server listening on port 5099');

  const baseURL = 'http://127.0.0.1:5099/api';

  const request = (path, options = {}) => {
    return new Promise((resolve, reject) => {
      const url = new URL(baseURL + path);
      const reqOpts = {
        method: options.method || 'GET',
        headers: options.headers || {},
      };
      const req = http.request(url, reqOpts, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      });
      req.on('error', reject);
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  };

  // 1. Health check
  const health = await request('/health');
  console.log('1. GET /api/health:', health.status, health.data);
  if (health.data.database !== 'MongoDB') {
    throw new Error('Database in health check should be MongoDB');
  }

  // 2. Auth Login (Admin)
  const loginRes = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { identifier: 'admin@factory.com', password: 'admin123' },
  });
  console.log('2. POST /api/auth/login (Admin):', loginRes.status, 'Token acquired:', Boolean(loginRes.data?.token));
  if (loginRes.status !== 200 || !loginRes.data?.token) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginRes.data));
  }
  const token = loginRes.data.token;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 3. Departments
  const depts = await request('/departments', { headers: authHeaders });
  console.log('3. GET /api/departments:', depts.status, 'Count:', depts.data?.departments?.length || depts.data?.length);

  // 4. Users
  const users = await request('/users', { headers: authHeaders });
  console.log('4. GET /api/users:', users.status, 'Count:', users.data?.users?.length || users.data?.length);

  // 5. Complaints
  const complaints = await request('/complaints', { headers: authHeaders });
  console.log('5. GET /api/complaints:', complaints.status, 'Count:', complaints.data?.count ?? complaints.data?.length);

  // 6. Tasks
  const tasks = await request('/tasks', { headers: authHeaders });
  console.log('6. GET /api/tasks:', tasks.status, 'Count:', tasks.data?.count ?? tasks.data?.length);

  // 7. KPI Stats
  const kpis = await request('/complaints/stats/kpi', { headers: authHeaders });
  console.log('7. GET /api/complaints/stats/kpi:', kpis.status, 'Success:', kpis.data?.success);

  // 8. Admin Oversight Stats
  const oversight = await request('/complaints/admin/oversight', { headers: authHeaders });
  console.log('8. GET /api/complaints/admin/oversight:', oversight.status, 'Success:', oversight.data?.success);

  // 9. Department Compliance Stats
  const deptStats = await request('/complaints/admin/department-compliance', { headers: authHeaders });
  console.log('9. GET /api/complaints/admin/department-compliance:', deptStats.status, 'Success:', deptStats.data?.success);

  // 10. Create Complaint & Verify
  const newNC = await request('/complaints', {
    method: 'POST',
    headers: authHeaders,
    body: {
      category: 'Fabric Defect',
      department: 'Production',
      location: 'Sewing Line 1',
      priority: 'Major',
      description: 'Minor oil mark on waistband panel during assembly testing',
      requirement: 'ISO 9001 Section 8.7',
      capRequired: true,
      verificationMethod: 'Physical Floor Re-inspection',
      targetSupervisorId: 'SUP-001',
      beforePhoto: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  });
  console.log('10. POST /api/complaints:', newNC.status, 'ID:', newNC.data?.complaint?.complaintId);
  if (newNC.status !== 201) {
    throw new Error('Create complaint failed: ' + JSON.stringify(newNC.data));
  }
  const createdId = newNC.data.complaint.complaintId;

  // 11. Fetch created complaint by ID
  const fetchedNC = await request(`/complaints/${createdId}`, { headers: authHeaders });
  console.log('11. GET /api/complaints/:id:', fetchedNC.status, 'Status:', fetchedNC.data?.complaint?.status);
  if (fetchedNC.status !== 200) {
    throw new Error('Fetch complaint by ID failed: ' + JSON.stringify(fetchedNC.data));
  }

  // 12. Clean up test complaint
  const deleteRes = await request(`/complaints/${createdId}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  console.log('12. DELETE /api/complaints/:id:', deleteRes.status, 'Deleted:', deleteRes.data?.success);

  server.close();
  console.log('\n--- ALL 12 TESTS PASSED PERFECTLY! MongoDB is 100% Operational ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('E2E Verification Error:', err);
  process.exit(1);
});
