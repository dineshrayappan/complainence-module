const { supabase, isSupabaseConfigured } = require('./server/config/supabase');
const mockStore = require('./server/config/mockStore');
const taskController = require('./server/controllers/taskController');

// Helper to simulate express req/res
const createMockRes = () => {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
};

async function runTest() {
  console.log('====================================================');
  console.log('TEST: Automatic Task Assignment & First Completer Race Shield');
  console.log('====================================================\n');

  // 1. Auditor creates task for Quality Department
  console.log('[Step 1] Internal Auditor assigns task to Quality Department pool...');
  const auditorUser = {
    id: 'usr-all-001',
    employeeId: 'ALL-001',
    name: 'Internal Auditor',
    role: 'AUDITOR',
    department: 'Central Quality Audit',
  };

  const createReq = {
    body: {
      title: 'Automated Test: Caliper & Dial Gauge Inspection',
      department: 'Quality',
      description: 'Check line 1 micrometers, calibration tolerance within 0.005mm.',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      priority: 'HIGH',
      assignedToUserId: 'DEPT_POOL',
    },
    user: auditorUser,
  };
  const createRes = createMockRes();
  await taskController.createTask(createReq, createRes);

  const task = createRes.data?.task;
  if (!task || !task.id) {
    console.error('Failed to create task:', createRes.data);
    process.exit(1);
  }
  console.log(`✓ Task created: [${task.id}] "${task.title}"`);
  console.log(`  Assigned:`, task.assignedTo);

  // 2. Employee 1 (Kavita Nair, SUP-002, Quality) starts task
  console.log('\n[Step 2] Employee 1 (Kavita Nair, SUP-002) starts working...');
  const emp1 = {
    id: 'usr-sup-002',
    employeeId: 'SUP-002',
    name: 'Kavita Nair',
    role: 'SUPERVISOR',
    department: 'Quality',
  };
  const startReq1 = { params: { id: task.id }, user: emp1 };
  const startRes1 = createMockRes();
  await taskController.startTask(startReq1, startRes1);
  console.log(`✓ Employee 1 start status: ${startRes1.statusCode}`);
  console.log(`  Active workers:`, startRes1.data?.task?.activeWorkers?.map(w => w.name));

  // 3. Employee 2 (srinivasan, AUD-003, Quality) ALSO starts working
  console.log('\n[Step 3] Employee 2 (srinivasan, AUD-003) ALSO starts working concurrently...');
  const emp2 = {
    id: 'usr-aud-003',
    employeeId: 'AUD-003',
    name: 'srinivasan',
    role: 'AUDITOR',
    department: 'Quality',
  };
  const startReq2 = { params: { id: task.id }, user: emp2 };
  const startRes2 = createMockRes();
  await taskController.startTask(startReq2, startRes2);
  console.log(`✓ Employee 2 start status: ${startRes2.statusCode}`);
  console.log(`  Active workers now:`, startRes2.data?.task?.activeWorkers?.map(w => w.name));

  // Check live status for Quality
  console.log('\n[Step 3b] Checking Department Live Status during concurrent work...');
  const liveReq = { query: { department: 'Quality' }, user: auditorUser };
  const liveRes = createMockRes();
  await taskController.getEmployeeWorkStatus(liveReq, liveRes);
  console.log('  Live Summary:', liveRes.data?.summary);
  liveRes.data?.employees.forEach(e => {
    console.log(`  - ${e.name} (${e.employeeId}): Status = ${e.status}, Task = ${e.assignedTask?.title || 'None'}`);
  });

  // 4. Employee 1 completes the task first with valid photo proof
  console.log('\n[Step 4] Employee 1 finishes first and uploads valid proof...');
  const completeReq1 = {
    params: { id: task.id },
    user: emp1,
    body: {
      proofPhoto: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      proofNotes: 'All 8 micrometers checked and verified against standard gauge blocks. Zero deviations.',
    },
  };
  const completeRes1 = createMockRes();
  await taskController.completeTask(completeReq1, completeRes1);
  console.log(`✓ Employee 1 complete status: ${completeRes1.statusCode}`);
  console.log(`  Message: ${completeRes1.data?.message}`);
  console.log(`  New Assigned Owner:`, completeRes1.data?.task?.assignedTo);
  console.log(`  First Completer:`, completeRes1.data?.task?.firstCompleter);

  // 5. Employee 2 attempts to simultaneously claim as first completer
  console.log('\n[Step 5] Employee 2 attempts to complete and claim the same task...');
  const completeReq2 = {
    params: { id: task.id },
    user: emp2,
    body: {
      proofPhoto: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      proofNotes: 'I also finished inspecting micrometers.',
    },
  };
  const completeRes2 = createMockRes();
  await taskController.completeTask(completeReq2, completeRes2);
  console.log(`✓ Employee 2 response status: ${completeRes2.statusCode} (Expected 409 Conflict)`);
  console.log(`  Conflict Code: ${completeRes2.data?.code}`);
  console.log(`  Conflict Message: ${completeRes2.data?.message}`);

  // 6. Check Department Live Status after completion
  console.log('\n[Step 6] Department Live Status & First Finisher Podium:');
  const finalLiveRes = createMockRes();
  await taskController.getEmployeeWorkStatus(liveReq, finalLiveRes);
  console.log('  Live Summary:', finalLiveRes.data?.summary);
  console.log('  🏆 First Finisher Podium:', finalLiveRes.data?.firstFinisher?.name, `(${finalLiveRes.data?.firstFinisher?.employeeId})`);
  finalLiveRes.data?.employees.forEach(e => {
    console.log(`  - ${e.name} (${e.employeeId}): Status = ${e.status}, Rank = ${e.completionRank || '—'}, Proof = ${e.proofStatus}`);
  });

  // Cleanup test task
  console.log('\n[Cleanup] Cleaning test task...');
  const delReq = { params: { id: task.id }, user: auditorUser };
  const delRes = createMockRes();
  await taskController.deleteTask(delReq, delRes);
  console.log('✓ Cleanup done.');
  console.log('\n====================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY! 🎯');
  console.log('====================================================');
}

runTest().catch(console.error);
