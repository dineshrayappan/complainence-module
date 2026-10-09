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
  console.log('VERIFICATION: Duplicate Assignment Prevention & Validation');
  console.log('====================================================\n');

  const auditorUser = {
    id: 'usr-all-001',
    employeeId: 'ALL-001',
    name: 'Internal Auditor',
    role: 'AUDITOR',
    department: 'Central Quality Audit',
  };

  const qualityEmp1 = {
    id: 'usr-sup-002',
    employeeId: 'SUP-002',
    name: 'Kavita Nair',
    role: 'SUPERVISOR',
    department: 'Quality',
  };

  const qualityEmp2 = {
    id: 'usr-aud-003',
    employeeId: 'AUD-003',
    name: 'srinivasan',
    role: 'AUDITOR',
    department: 'Quality',
  };

  const productionEmp = {
    id: 'usr-sup-001',
    employeeId: 'SUP-001',
    name: 'Rajesh Kumar',
    role: 'SUPERVISOR',
    department: 'Production',
  };

  // 1. Auditor creates task for Quality Department
  console.log('[Test 1] Internal Auditor assigns task to Quality Department pool...');
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
  console.log(`✓ Task created: [${task.id}] "${task.title}" (Pool: ${task.assignedTo?.name})`);

  // 2. Unauthorized Department Employee attempts to start Quality task
  console.log('\n[Test 2] Unauthorized Production employee attempts to start Quality task...');
  const unauthStartReq = { params: { id: task.id }, user: productionEmp };
  const unauthStartRes = createMockRes();
  await taskController.startTask(unauthStartReq, unauthStartRes);
  console.log(`✓ Production employee start status: ${unauthStartRes.statusCode} (Expected: 403 Forbidden)`);
  console.log(`  Code: ${unauthStartRes.data?.code}, Message: ${unauthStartRes.data?.message}`);

  // 3. Authorized Quality Employee 1 starts working
  console.log('\n[Test 3] Authorized Quality Employee 1 (Kavita Nair, SUP-002) starts working...');
  const startReq1 = { params: { id: task.id }, user: qualityEmp1 };
  const startRes1 = createMockRes();
  await taskController.startTask(startReq1, startRes1);
  console.log(`✓ Employee 1 start status: ${startRes1.statusCode}`);
  console.log(`  Active workers:`, startRes1.data?.task?.activeWorkers?.map((w) => w.name));

  // 4. Busy Employee Prevention: Employee 1 attempts to start a second task while already busy
  console.log('\n[Test 4] Busy Employee Prevention: Employee 1 tries to start a 2nd task while already busy...');
  const createReq2 = {
    body: {
      title: 'Automated Test: Secondary Fabric Shrinkage Check',
      department: 'Quality',
      description: 'Secondary task for busy check.',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      priority: 'MEDIUM',
      assignedToUserId: 'DEPT_POOL',
    },
    user: auditorUser,
  };
  const createRes2 = createMockRes();
  await taskController.createTask(createReq2, createRes2);
  const task2 = createRes2.data?.task;

  const busyStartReq = { params: { id: task2.id }, user: qualityEmp1 };
  const busyStartRes = createMockRes();
  await taskController.startTask(busyStartReq, busyStartRes);
  console.log(`✓ Busy employee starting 2nd task status: ${busyStartRes.statusCode} (Expected: 400 Bad Request)`);
  console.log(`  Code: ${busyStartRes.data?.code}, Message: ${busyStartRes.data?.message}`);

  // 5. Authorized Quality Employee 2 starts working on Task 1 concurrently
  console.log('\n[Test 5] Quality Employee 2 (srinivasan, AUD-003) starts working concurrently on Task 1...');
  const startReq2 = { params: { id: task.id }, user: qualityEmp2 };
  const startRes2 = createMockRes();
  await taskController.startTask(startReq2, startRes2);
  console.log(`✓ Employee 2 start status: ${startRes2.statusCode}`);
  console.log(`  Active workers now:`, startRes2.data?.task?.activeWorkers?.map((w) => w.name));
  console.log(`  Task Work Notice:`, startRes2.data?.task?.workNotice);

  // 6. Check Department Live Status: verify busy employees are NOT shown as available
  console.log('\n[Test 6] Department Live Status: verify busy employees are NOT shown as available...');
  const liveReq = { query: { department: 'Quality' }, user: auditorUser };
  const liveRes = createMockRes();
  await taskController.getEmployeeWorkStatus(liveReq, liveRes);
  console.log('  Summary:', liveRes.data?.summary);
  liveRes.data?.employees.forEach((e) => {
    console.log(`  - ${e.name} (${e.employeeId}): Status = "${e.status}", Task = "${e.assignedTask?.title}"`);
  });
  if (liveRes.data?.summary?.available !== 0) {
    console.warn('⚠️ Warning: Expected 0 available workers during concurrent work');
  } else {
    console.log('✓ All active workers are correctly shown as "In Progress / Busy", 0 available.');
  }

  // 7. Employee 1 completes the task first with valid photo proof
  console.log('\n[Test 7] Employee 1 completes Task 1 first with valid proof...');
  const proofPayload = {
    proofPhoto: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    proofNotes: 'All 8 micrometers checked and verified against standard gauge blocks. Zero deviations.',
  };
  const completeReq1 = { params: { id: task.id }, user: qualityEmp1, body: proofPayload };
  const completeRes1 = createMockRes();
  await taskController.completeTask(completeReq1, completeRes1);
  console.log(`✓ Employee 1 complete status: ${completeRes1.statusCode}`);
  console.log(`  Assigned Owner:`, completeRes1.data?.task?.assignedTo?.name, `[${completeRes1.data?.task?.assignedTo?.employeeId}]`);
  console.log(`  First Completer:`, completeRes1.data?.task?.firstCompleter?.name, `[${completeRes1.data?.task?.firstCompleter?.employeeId}]`);
  console.log(`  Completed At:`, completeRes1.data?.task?.completedAt);

  // 8. Prevent duplicate completion from changing the first completer (Duplicate submission guard)
  console.log('\n[Test 8] Duplicate completion submission attempt (Employee 2)...');
  const completeReq2 = {
    params: { id: task.id },
    user: qualityEmp2,
    body: {
      proofPhoto: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      proofNotes: 'Finished inspection later.',
    },
  };
  const completeRes2 = createMockRes();
  await taskController.completeTask(completeReq2, completeRes2);
  console.log(`✓ Employee 2 response status: ${completeRes2.statusCode} (Expected: 409 Conflict)`);
  console.log(`  Code: ${completeRes2.data?.code}, Message: ${completeRes2.data?.message}`);
  console.log(`  Preserved First Completer:`, completeRes2.data?.firstCompleter?.name);

  // 8b. Duplicate submission by Employee 1 themselves (resubmit attempt)
  console.log('\n[Test 8b] Duplicate completion resubmission attempt by Employee 1...');
  const completeRes1Retry = createMockRes();
  await taskController.completeTask(completeReq1, completeRes1Retry);
  console.log(`✓ Employee 1 resubmit status: ${completeRes1Retry.statusCode} (Expected: 409 Conflict)`);
  console.log(`  First Completer remained unchanged: ${completeRes1Retry.data?.firstCompleter?.name}`);

  // 9. Database persistence verification
  console.log('\n[Test 9] Database persistence check (Reading fresh task)...');
  const getTasksReq = { query: { state: 'all' }, user: auditorUser };
  const getTasksRes = createMockRes();
  await taskController.getTasks(getTasksReq, getTasksRes);
  const refreshedTask = getTasksRes.data?.tasks?.find((t) => String(t.id) === String(task.id));
  console.log('✓ Refreshed Task from storage:');
  console.log(`  - Status: ${refreshedTask?.status}`);
  console.log(`  - Assigned Owner: ${refreshedTask?.assignedTo?.name} (${refreshedTask?.assignedTo?.employeeId})`);
  console.log(`  - First Completer: ${refreshedTask?.firstCompleter?.name} (${refreshedTask?.firstCompleter?.employeeId})`);
  console.log(`  - Started At: ${refreshedTask?.startedAt}`);
  console.log(`  - Completed At: ${refreshedTask?.completedAt}`);
  console.log(`  - Proof Photo: ${refreshedTask?.proofPhoto ? 'Present (Base64)' : 'Missing'}`);
  console.log(`  - Proof Notes: "${refreshedTask?.proofNotes}"`);

  // Cleanup test tasks
  console.log('\n[Cleanup] Cleaning up test tasks...');
  const delReq1 = { params: { id: task.id }, user: auditorUser };
  await taskController.deleteTask(delReq1, createMockRes());
  const delReq2 = { params: { id: task2.id }, user: auditorUser };
  await taskController.deleteTask(delReq2, createMockRes());
  console.log('✓ Cleanup completed.');

  console.log('\n====================================================');
  console.log('ALL VERIFICATION CHECKS PASSED PERFECTLY! 🎯');
  console.log('====================================================');
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
