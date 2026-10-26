const http = require('http');
const assert = require('assert');
const { toBase64DataUrl, isBase64DataUrl } = require('../utils/base64Helper');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Base64 Image Persistence Verification');
  console.log('====================================================\n');

  // Test 1: Unit tests for toBase64DataUrl
  console.log('[Test 1] Testing toBase64DataUrl with various inputs...');

  // 1a: Buffer
  const sampleBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const b64FromBuf = toBase64DataUrl(sampleBuf);
  assert(b64FromBuf.startsWith('data:image/jpeg;base64,'), 'Buffer should convert to jpeg base64 data url');
  console.log('  ✓ Buffer -> Base64 data URL verified');

  // 1b: Raw SVG string
  const sampleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="red"/></svg>';
  const b64FromSvg = toBase64DataUrl(sampleSvg);
  assert(b64FromSvg.startsWith('data:image/svg+xml;base64,'), 'SVG string should convert to svg base64 data url');
  console.log('  ✓ SVG String -> Base64 data URL verified');

  // 1c: Raw JPEG base64 string without header
  const rawJpegB64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const b64FromRaw = toBase64DataUrl(rawJpegB64);
  assert(b64FromRaw.startsWith('data:image/jpeg;base64,'), 'Raw base64 should get proper data url prefix');
  console.log('  ✓ Raw Base64 string -> Full data URL prefix verified');

  // 1d: Existing Data URL
  const existingDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const b64Existing = toBase64DataUrl(existingDataUrl);
  assert.strictEqual(b64Existing, existingDataUrl, 'Existing Data URL should remain identical');
  console.log('  ✓ Existing Data URL passthrough verified');

  // Test 2: API & Database Persistence
  console.log('\n[Test 2] Starting test server and testing complaint creation...');
  const app = require('../server');
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(5098, '127.0.0.1', resolve));
  const baseURL = 'http://127.0.0.1:5098/api';

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

  try {
    // Login as Admin / Auditor
    const loginRes = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: 'admin@factory.com', password: 'admin123' },
    });

    assert.strictEqual(loginRes.status, 200, 'Login should succeed');
    const token = loginRes.data.token;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // Create a complaint with Base64 photo
    const sampleBeforePhotoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const createRes = await request('/complaints', {
      method: 'POST',
      headers: authHeaders,
      body: {
        department: 'Production',
        location: 'Line 2 - Production Floor',
        priority: 'HIGH',
        description: 'Needle break defect observed during inline audit',
        beforePhotoBase64: sampleBeforePhotoBase64,
        capRequired: true,
      },
    });

    console.log('  Create complaint response status:', createRes.status);
    assert.strictEqual(createRes.status, 201, 'Complaint creation should return 201');
    const createdTicket = createRes.data.complaint;
    assert(createdTicket, 'Ticket object should exist in response');

    console.log(`  ✓ Created complaint ${createdTicket.complaintId}`);
    console.log('  Checking beforePhoto format in response...');
    assert(
      createdTicket.beforePhoto.startsWith('data:image/'),
      'beforePhoto in created ticket must be a Base64 Data URL'
    );
    console.log('  ✓ beforePhoto is verified as Base64 Data URL');

    // Test 3: Submit Action with After Photo
    console.log('\n[Test 3] Submitting CAP Action with Base64 After Photo...');
    const sampleAfterPhotoBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const actionRes = await request(`/complaints/${createdTicket._id || createdTicket.id}/submit-action`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        immediateCorrection: 'Needle replaced and machine calibrated.',
        rootCause: 'Needle deflection due to excessive tension.',
        correctiveAction: 'Tension recalibrated to standard operating tolerances.',
        preventiveAction: 'Hourly needle inspections instituted on line.',
        afterPhotoBase64: sampleAfterPhotoBase64,
      },
    });

    console.log('  Submit action response status:', actionRes.status);
    assert.strictEqual(actionRes.status, 200, 'Action submission should return 200');
    const updatedTicket = actionRes.data.complaint;
    assert(updatedTicket, 'Updated ticket should exist in response');
    assert(
      updatedTicket.afterPhoto && updatedTicket.afterPhoto.startsWith('data:image/'),
      'afterPhoto in updated ticket must be a Base64 Data URL'
    );
    console.log('  ✓ afterPhoto is verified as Base64 Data URL');

    // Test 4: Retrieve by ID to verify persistence
    console.log('\n[Test 4] Retrieving complaint by ID to verify persistent Base64 storage...');
    const getRes = await request(`/complaints/${createdTicket._id || createdTicket.id}`, {
      headers: authHeaders,
    });

    assert.strictEqual(getRes.status, 200, 'Get complaint should return 200');
    const fetched = getRes.data.complaint;
    assert(fetched.beforePhoto.startsWith('data:image/'), 'Persisted beforePhoto must be Base64 Data URL');
    assert(fetched.afterPhoto.startsWith('data:image/'), 'Persisted afterPhoto must be Base64 Data URL');
    console.log('  ✓ Both beforePhoto and afterPhoto persisted as Base64 Data URLs verified!');

    console.log('\n====================================================');
    console.log('🎉 ALL BASE64 ENCODING TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
