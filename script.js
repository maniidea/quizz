// REPLACE WITH YOUR CURRENT DEPLOYED WEB APP URL:
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxa_rGAjRgnrijC6Kqtw1zpS-Kil2--kl_uWylaUjCGcj-KLTRsPs3TgLNayXoQ1EvwRQ/exec";

let currentUser = null;
let appConfig = { 
  standards: ["5", "6", "7", "8", "9", "10", "12"], 
  subjects: ["Science", "Maths", "Social Science", "English", "Botany"] 
};
let masterQuestionsPool = [];
let extractedBatch = [];
let adminMasterScores = [];
let adminUsersList = [];

// SINGLE QUESTION & TIMER STATE VARIABLES
let activeQuizList = [];
let currentQuestionIndex = 0;
let userScore = 0;
let perQuestionTime = 20; // in seconds (0 means no timer)
let timeRemaining = 0;
let timerInterval = null;
let autoNextTimeout = null;
let answeredCurrentQuestion = false;

window.onload = async () => {
  const savedUser = localStorage.getItem("quizUser");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
  }
  
  populateDropdowns();
  await loadInitialConfigs();

  if (currentUser) {
    initSession();
  }
};

// Fetch Standards, Subjects, and Questions bundle
async function loadInitialConfigs() {
  try {
    const url = `${SCRIPT_URL}?action=getInitialData${currentUser ? '&userId=' + encodeURIComponent(currentUser.id) : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.success) {
      if (data.standards && data.standards.length > 0) appConfig.standards = data.standards;
      if (data.subjects && data.subjects.length > 0) appConfig.subjects = data.subjects;
      if (data.questions) masterQuestionsPool = data.questions;
      if (data.user) {
        currentUser = data.user;
        localStorage.setItem("quizUser", JSON.stringify(currentUser));
      }
      populateDropdowns();
    }
  } catch (err) {
    console.warn("Using fallback local dataset:", err);
  }
}

function populateDropdowns() {
  const stdSelects = ["loginUserStd", "batchStd", "manualStd", "adminFilterStd"];
  const subSelects = ["quizSubjectSelect", "batchSub", "manualSub", "adminFilterSub"];

  stdSelects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id.includes("Filter");
    const currentVal = el.value;
    el.innerHTML = isFilter ? '<option value="">All Standards</option>' : '';
    appConfig.standards.forEach(std => {
      el.innerHTML += `<option value="${std}">Class ${std}</option>`;
    });
    if (currentVal) el.value = currentVal;
  });

  subSelects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id.includes("Filter");
    const currentVal = el.value;
    el.innerHTML = isFilter ? '<option value="">All Subjects</option>' : '';
    appConfig.subjects.forEach(sub => {
      el.innerHTML += `<option value="${sub}">${sub}</option>`;
    });
    if (currentVal) el.value = currentVal;
  });

  populatePlayStandards();
}

function populatePlayStandards() {
  const playStdSelect = document.getElementById("quizStdSelect");
  if (!playStdSelect) return;
  const currentVal = playStdSelect.value;
  playStdSelect.innerHTML = "";

  if (currentUser) {
    const allowed = (currentUser.standards && currentUser.standards.length > 0) 
      ? currentUser.standards 
      : appConfig.standards;

    allowed.forEach(std => {
      playStdSelect.innerHTML += `<option value="${std}">Class ${std}</option>`;
    });
    if (currentVal && allowed.includes(currentVal)) {
      playStdSelect.value = currentVal;
    }
  }
}

// User Sign In / Registration
async function handleAuth() {
  const userId = document.getElementById("loginUserId").value.trim();
  const name = document.getElementById("loginUserName").value.trim();
  const standard = document.getElementById("loginUserStd").value;
  const role = document.getElementById("loginUserRole").value;

  if (!userId || !name) return alert("Please provide both User ID and Full Name.");

  const payload = { action: "registerUser", userId, name, standard, role };
  
  try {
    const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();

    if (data.success) {
      currentUser = data.user;
      localStorage.setItem("quizUser", JSON.stringify(currentUser));
      await loadInitialConfigs();
      initSession();
    } else {
      alert("Authentication failed: " + data.error);
    }
  } catch (err) {
    alert("Network error: " + err.message);
  }
}

function initSession() {
  document.getElementById("authView").classList.add("hidden");
  document.getElementById("mainApp").classList.remove("hidden");
  document.getElementById("logoutBtn").classList.remove("hidden");

  const badge = document.getElementById("userBadge");
  badge.classList.remove("hidden");
  const stdLabel = currentUser.standards ? currentUser.standards.join(", ") : "All";
  badge.innerText = `${currentUser.name} (${currentUser.role.toUpperCase()}) | Classes: ${stdLabel}`;

  populatePlayStandards();

  if (currentUser.role === "admin") {
    document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
  }

  loadUserReports();
}

function logout() {
  localStorage.removeItem("quizUser");
  location.reload();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  ["playTab", "createTab", "reportsTab", "adminTab"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });

  event.target.classList.add("active");

  if (tab === "play") {
    document.getElementById("playTab").classList.remove("hidden");
    resetQuizView();
  }
  if (tab === "create") document.getElementById("createTab").classList.remove("hidden");
  if (tab === "reports") {
    document.getElementById("reportsTab").classList.remove("hidden");
    loadUserReports();
  }
  if (tab === "admin") {
    document.getElementById("adminTab").classList.remove("hidden");
    loadAdminDashboard();
  }
}

function switchCreateMethod(method) {
  const btnAi = document.getElementById("btnMethodAi");
  const btnManual = document.getElementById("btnMethodManual");
  const secAi = document.getElementById("sectionAiCreate");
  const secManual = document.getElementById("sectionManualCreate");

  if (method === 'ai') {
    btnAi.className = "btn btn-secondary flex-1";
    btnManual.className = "btn btn-outline-dark flex-1";
    secAi.classList.remove("hidden");
    secManual.classList.add("hidden");
  } else {
    btnAi.className = "btn btn-outline-dark flex-1";
    btnManual.className = "btn btn-primary flex-1";
    secManual.classList.remove("hidden");
    secAi.classList.add("hidden");
  }
}

// -------------------------------------------------------------
// 1. SINGLE-QUESTION QUIZ ENGINE WITH TIME SCHEDULE & QUESTION LIMIT
// -------------------------------------------------------------
function resetQuizView() {
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);
  document.getElementById("quizSetupCard").classList.remove("hidden");
  document.getElementById("quizActiveCard").classList.add("hidden");
  document.getElementById("quizResultCard").classList.add("hidden");
}

function toggleSelectAllQuestions(isAll) {
  const countInput = document.getElementById("quizCustomCountInput");
  if (!countInput) return;
  
  if (isAll) {
    countInput.disabled = true;
    countInput.style.backgroundColor = "#e9ecef";
    countInput.value = "";
    countInput.placeholder = "All Available";
  } else {
    countInput.disabled = false;
    countInput.style.backgroundColor = "#ffffff";
    countInput.placeholder = "Type count (e.g. 5, 25)";
    countInput.value = "5";
  }
}

async function startQuiz() {
  const stdEl = document.getElementById("quizStdSelect");
  const subjectEl = document.getElementById("quizSubjectSelect");
  const countInput = document.getElementById("quizCustomCountInput");
  const selectAllCheckbox = document.getElementById("quizSelectAllCheckbox");
  const timerEl = document.getElementById("quizTimerSelect");
  
  const rawStd = stdEl ? stdEl.value : "";
  const rawSub = subjectEl ? subjectEl.value : "";
  perQuestionTime = Number(timerEl ? timerEl.value : 20);

  const isAllSelected = selectAllCheckbox ? selectAllCheckbox.checked : false;
  const typedCount = countInput ? parseInt(countInput.value, 10) : 5;

  if (!isAllSelected && (!typedCount || typedCount <= 0)) {
    alert("Please enter a valid number of questions or select 'All Questions'.");
    return;
  }

  const targetStd = rawStd.toString().toLowerCase().replace(/class/gi, "").replace(/\s+/g, "");
  const targetSub = rawSub.toString().toLowerCase().replace(/\s+/g, "");

  if (!masterQuestionsPool || masterQuestionsPool.length === 0) {
    await loadInitialConfigs();
  }

  let matched = masterQuestionsPool.filter(q => {
    const rowStd = (q.standard || "").toString().toLowerCase().replace(/class/gi, "").replace(/\s+/g, "");
    const rowSub = (q.subject || "").toString().toLowerCase().replace(/\s+/g, "");
    return (!targetStd || rowStd === targetStd) && (!targetSub || rowSub === targetSub);
  });

  if (!matched || matched.length === 0) {
    alert(`No questions found for Class ${rawStd} - ${rawSub}. Please create some under "Upload / Create Q&A" first!`);
    return;
  }

  matched.sort(() => Math.random() - 0.5);

  if (!isAllSelected) {
    const limit = Math.min(typedCount, matched.length);
    matched = matched.slice(0, limit);
  }

  activeQuizList = matched;
  currentQuestionIndex = 0;
  userScore = 0;

  document.getElementById("quizSetupCard").classList.add("hidden");
  document.getElementById("quizResultCard").classList.add("hidden");
  document.getElementById("quizActiveCard").classList.remove("hidden");

  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);
  answeredCurrentQuestion = false;

  const total = activeQuizList.length;
  const q = activeQuizList[currentQuestionIndex];

  document.getElementById("quizProgressBadge").innerText = `Question ${currentQuestionIndex + 1} of ${total}`;

  const nextBtn = document.getElementById("btnNextQuestion");
  nextBtn.innerText = (currentQuestionIndex === total - 1) ? "Submit & Finish 🏁" : "Next Question ⏩";

  const qArea = document.getElementById("singleQuestionArea");
  qArea.innerHTML = `
    <h3 style="margin-top:0; font-size:1.15rem; font-weight:600;">${q.question}</h3>
    <div class="options-grid">
      <button class="opt-btn" onclick="handleOptionSelect(1, this)">A. ${q.optA}</button>
      <button class="opt-btn" onclick="handleOptionSelect(2, this)">B. ${q.optB}</button>
      <button class="opt-btn" onclick="handleOptionSelect(3, this)">C. ${q.optC}</button>
      <button class="opt-btn" onclick="handleOptionSelect(4, this)">D. ${q.optD}</button>
    </div>
  `;

  const timerBadge = document.getElementById("timerContainer");
  const timerBarTrack = document.getElementById("timerBarTrack");
  const timerBarFill = document.getElementById("timerBarFill");

  if (perQuestionTime > 0) {
    timerBadge.classList.remove("hidden");
    timerBarTrack.classList.remove("hidden");
    timeRemaining = perQuestionTime;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      timeRemaining--;
      updateTimerDisplay();

      if (timeRemaining <= 0) {
        clearInterval(timerInterval);
        handleTimeUp();
      }
    }, 1000);
  } else {
    timerBadge.classList.add("hidden");
    timerBarTrack.classList.add("hidden");
  }
}

function updateTimerDisplay() {
  const timerText = document.getElementById("timerText");
  const timerBadge = document.getElementById("timerContainer");
  const timerBarFill = document.getElementById("timerBarFill");

  timerText.innerText = `${timeRemaining}s`;

  const pct = (timeRemaining / perQuestionTime) * 100;
  timerBarFill.style.width = `${pct}%`;

  if (timeRemaining <= 5) {
    timerBadge.classList.add("danger");
  } else {
    timerBadge.classList.remove("danger");
  }
}

function handleOptionSelect(selectedOpt, btn) {
  if (answeredCurrentQuestion) return;
  answeredCurrentQuestion = true;
  clearInterval(timerInterval);

  const q = activeQuizList[currentQuestionIndex];
  const correct = Number(q.correctOpt);
  const parent = btn.parentElement;
  const allButtons = parent.querySelectorAll(".opt-btn");

  allButtons.forEach(b => b.disabled = true);

  if (selectedOpt === correct) {
    btn.classList.add("correct");
    userScore++;
  } else {
    btn.classList.add("wrong");
    if (allButtons[correct - 1]) {
      allButtons[correct - 1].classList.add("correct");
    }
  }

  if (perQuestionTime > 0) {
    autoNextTimeout = setTimeout(() => {
      nextQuestion(true);
    }, 2000);
  }
}

function handleTimeUp() {
  if (answeredCurrentQuestion) return;
  answeredCurrentQuestion = true;

  const q = activeQuizList[currentQuestionIndex];
  const correct = Number(q.correctOpt);
  const allButtons = document.querySelectorAll("#singleQuestionArea .opt-btn");

  allButtons.forEach(b => b.disabled = true);
  if (allButtons[correct - 1]) {
    allButtons[correct - 1].classList.add("correct");
  }

  const qArea = document.getElementById("singleQuestionArea");
  const alertDiv = document.createElement("div");
  alertDiv.style.color = "#d32f2f";
  alertDiv.style.fontWeight = "bold";
  alertDiv.style.marginTop = "10px";
  alertDiv.innerText = "⏰ Time's up! Moving to the next question...";
  qArea.appendChild(alertDiv);

  autoNextTimeout = setTimeout(() => {
    nextQuestion(true);
  }, 2200);
}

function nextQuestion(isAuto) {
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);

  if (currentQuestionIndex < activeQuizList.length - 1) {
    currentQuestionIndex++;
    renderCurrentQuestion();
  } else {
    finishQuiz();
  }
}

async function finishQuiz() {
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);

  document.getElementById("quizActiveCard").classList.add("hidden");
  document.getElementById("quizResultCard").classList.remove("hidden");

  const total = activeQuizList.length;
  const pct = Math.round((userScore / total) * 100);

  document.getElementById("resultScoreDisplay").innerText = `${userScore} / ${total} (${pct}%)`;

  let feedback = "Good effort! Keep practicing to improve your score.";
  if (pct === 100) feedback = "🌟 Outstanding! Perfect score!";
  else if (pct >= 80) feedback = "🎉 Excellent performance!";
  else if (pct >= 50) feedback = "👍 Good job! You passed!";
  document.getElementById("resultFeedback").innerText = feedback;

  const selectedStd = document.getElementById("quizStdSelect").value;
  const subject = document.getElementById("quizSubjectSelect").value;

  const payload = {
    action: "saveScore",
    userId: currentUser.id,
    userName: currentUser.name,
    standard: selectedStd,
    subject: subject,
    score: userScore,
    total: total
  };

  try {
    await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
  } catch (e) {
    console.error("Score save error:", e);
  }
}

// -------------------------------------------------------------
// 2. OCR GENERATION VIA GEMINI VISION
// -------------------------------------------------------------
async function generateFromImage() {
  const fileInput = document.getElementById("imageInput");
  const file = fileInput.files[0];
  if (!file) return alert("Select an image file first.");

  const count = document.getElementById("ocrCount").value;
  const loader = document.getElementById("ocrLoader");
  loader.classList.remove("hidden");

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "parseImage", imageBase64: reader.result, questionCount: count })
      });
      const data = await res.json();
      loader.classList.add("hidden");

      if (data.success && data.questions && data.questions.length > 0) {
        extractedBatch = data.questions;
        renderBatchPreview(extractedBatch);
        document.getElementById("ocrPreviewArea").classList.remove("hidden");
      } else {
        alert("Extraction failed: " + (data.error || "No questions created."));
      }
    } catch (err) {
      loader.classList.add("hidden");
      alert("Error: " + err.message);
    }
  };
  reader.readAsDataURL(file);
}

function renderBatchPreview(list) {
  const box = document.getElementById("batchPreviewList");
  box.innerHTML = "";
  list.forEach((q, i) => {
    box.innerHTML += `
      <div style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:4px;">
        <strong>${i+1}. ${q.question}</strong><br>
        <small>A) ${q.optA} | B) ${q.optB} | C) ${q.optC} | D) ${q.optD}</small> (Correct: Option ${q.correctOpt})
      </div>
    `;
  });
}

async function saveExtractedBatch() {
  const payload = {
    action: "saveBatchQuestions",
    userId: currentUser.id,
    standard: document.getElementById("batchStd").value,
    subject: document.getElementById("batchSub").value,
    questions: extractedBatch
  };

  const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
  const data = await res.json();
  if (data.success) {
    alert(`Successfully saved ${data.count} questions!`);
    document.getElementById("ocrPreviewArea").classList.add("hidden");
    await loadInitialConfigs();
  }
}

// -------------------------------------------------------------
// 3. MANUAL SINGLE QUESTION PUBLISH
// -------------------------------------------------------------
async function publishManualSingleQuestion() {
  const qText = document.getElementById("manualQuestionText").value.trim();
  const optA = document.getElementById("manualOptA").value.trim();
  const optB = document.getElementById("manualOptB").value.trim();
  const optC = document.getElementById("manualOptC").value.trim();
  const optD = document.getElementById("manualOptD").value.trim();
  const correctOpt = Number(document.getElementById("manualCorrectOpt").value);
  const standard = document.getElementById("manualStd").value;
  const subject = document.getElementById("manualSub").value;

  if (!qText || !optA || !optB || !optC || !optD) {
    return alert("Please fill in the Question and all 4 Options.");
  }

  const payload = {
    action: "saveQuestion",
    userId: currentUser.id,
    standard: standard,
    subject: subject,
    question: qText,
    optA: optA,
    optB: optB,
    optC: optC,
    optD: optD,
    correctOpt: correctOpt
  };

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      alert("✅ Question published successfully!");
      document.getElementById("manualQuestionText").value = "";
      document.getElementById("manualOptA").value = "";
      document.getElementById("manualOptB").value = "";
      document.getElementById("manualOptC").value = "";
      document.getElementById("manualOptD").value = "";
      await loadInitialConfigs();
    } else {
      alert("Failed to save: " + data.error);
    }
  } catch (err) {
    alert("Network error: " + err.message);
  }
}

// -------------------------------------------------------------
// 4. USER REPORTS (Accurate Local Date Normalization)
// -------------------------------------------------------------
let userMasterScores = [];

async function loadUserReports() {
  if (!currentUser) return;
  const tbody = document.getElementById("userScoresTable");
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Loading scores...</td></tr>`;

  populateReportFilters();

  try {
    const res = await fetch(`${SCRIPT_URL}?action=getUserScores&userId=${encodeURIComponent(currentUser.id)}`);
    const data = await res.json();

    if (data.success && data.scores) {
      userMasterScores = data.scores;
      filterUserReports();
    } else {
      userMasterScores = [];
      renderUserReportsTable([]);
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Failed to load reports: ${err.message}</td></tr>`;
  }
}

function populateReportFilters() {
  const stdSelect = document.getElementById("reportFilterStd");
  const subSelect = document.getElementById("reportFilterSub");

  if (stdSelect) {
    const currentVal = stdSelect.value;
    stdSelect.innerHTML = '<option value="">All Standards</option>';
    appConfig.standards.forEach(std => {
      stdSelect.innerHTML += `<option value="${std}">Class ${std}</option>`;
    });
    if (currentVal) stdSelect.value = currentVal;
  }

  if (subSelect) {
    const currentVal = subSelect.value;
    subSelect.innerHTML = '<option value="">All Subjects</option>';
    appConfig.subjects.forEach(sub => {
      subSelect.innerHTML += `<option value="${sub}">${sub}</option>`;
    });
    if (currentVal) subSelect.value = currentVal;
  }
}

function filterUserReports() {
  const fromDateVal = document.getElementById("reportFromDate").value; 
  const toDateVal = document.getElementById("reportToDate").value;     
  const stdVal = document.getElementById("reportFilterStd").value.toString().toLowerCase().replace(/class/gi, "").trim();
  const subVal = document.getElementById("reportFilterSub").value.toString().toLowerCase().trim();

  const filtered = userMasterScores.filter(item => {
    // Extract Local YYYY-MM-DD safely without UTC shift
    let itemDate = "";
    if (item.date) {
      const d = new Date(item.date);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        itemDate = `${year}-${month}-${day}`;
      } else {
        itemDate = item.date.toString().substring(0, 10);
      }
    }

    const matchFrom = !fromDateVal || (itemDate >= fromDateVal);
    const matchTo = !toDateVal || (itemDate <= toDateVal);

    const itemStd = (item.standard || "").toString().toLowerCase().replace(/class/gi, "").trim();
    const itemSub = (item.subject || "").toString().toLowerCase().trim();

    const matchStd = !stdVal || (itemStd === stdVal);
    const matchSub = !subVal || (itemSub === subVal);

    return matchFrom && matchTo && matchStd && matchSub;
  });

  renderUserReportsTable(filtered);
}

function renderUserReportsTable(list) {
  const tbody = document.getElementById("userScoresTable");
  tbody.innerHTML = "";

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#666;">No quiz records found for the selected date range and filters.</td></tr>`;
    document.getElementById("statTotalTests").innerText = "0";
    document.getElementById("statAvgScore").innerText = "0%";
    document.getElementById("statBestScore").innerText = "0%";
    return;
  }

  let totalPct = 0;
  let bestPct = 0;

  list.forEach(s => {
    const rawScore = Number(s.score) || 0;
    const rawTotal = Number(s.total) || 1;
    const pct = Math.round((rawScore / rawTotal) * 100);

    totalPct += pct;
    if (pct > bestPct) bestPct = pct;

    let displayDate = s.date;
    if (s.date && s.date.includes("T")) {
      displayDate = s.date.split("T")[0];
    }

    const pctColor = pct >= 80 ? '#2e7d32' : (pct >= 50 ? '#003366' : '#d32f2f');

    tbody.innerHTML += `
      <tr>
        <td><strong>${displayDate}</strong></td>
        <td>Class ${s.standard}</td>
        <td>${s.subject}</td>
        <td>${rawScore} / ${rawTotal}</td>
        <td><strong style="color:${pctColor};">${pct}%</strong></td>
      </tr>
    `;
  });

  const avgPct = Math.round(totalPct / list.length);
  document.getElementById("statTotalTests").innerText = list.length;
  document.getElementById("statAvgScore").innerText = `${avgPct}%`;
  document.getElementById("statBestScore").innerText = `${bestPct}%`;
}

function resetReportDateFilters() {
  document.getElementById("reportFromDate").value = "";
  document.getElementById("reportToDate").value = "";
  document.getElementById("reportFilterStd").value = "";
  document.getElementById("reportFilterSub").value = "";
  filterUserReports();
}

// -------------------------------------------------------------
// 5. ADMIN DASHBOARD & CHECKMARK ACCESS
// -------------------------------------------------------------
async function loadAdminDashboard() {
  const resScores = await fetch(`${SCRIPT_URL}?action=getAllScores&adminId=${encodeURIComponent(currentUser.id)}`);
  const dataScores = await resScores.json();
  if (dataScores.success) {
    adminMasterScores = dataScores.scores || [];
    renderAdminTable(adminMasterScores);
    renderAdminConfigBadges();
  }

  const resUsers = await fetch(`${SCRIPT_URL}?action=getAllUsers&adminId=${encodeURIComponent(currentUser.id)}`);
  const dataUsers = await resUsers.json();
  if (dataUsers.success) {
    adminUsersList = dataUsers.users || [];
    renderAdminUserPermissionsTable();
  }
}

function renderAdminUserPermissionsTable() {
  const tbody = document.getElementById("adminUserPermissionTable");
  tbody.innerHTML = "";

  adminUsersList.forEach(u => {
    const checkboxesHtml = appConfig.standards.map(std => {
      const isChecked = u.standards.includes(std.toString()) ? "checked" : "";
      return `
        <label style="display:inline-flex; align-items:center; margin-right:10px; font-size:0.85rem; cursor:pointer;">
          <input type="checkbox" style="width:auto; margin-right:4px;" value="${std}" ${isChecked} onchange="toggleUserStandard('${u.id}', '${std}', this.checked)">
          Class ${std}
        </label>
      `;
    }).join("");

    tbody.innerHTML += `
      <tr>
        <td><strong>${u.id}</strong></td>
        <td>${u.name}</td>
        <td><span class="badge" style="background:${u.role === 'admin' ? '#003366; color:#fff;' : '#dee2e6;'}">${u.role.toUpperCase()}</span></td>
        <td>${checkboxesHtml}</td>
        <td>
          <button class="btn btn-outline-dark" style="padding:4px 8px; font-size:0.8rem;" onclick="saveUserPermissions('${u.id}')">💾 Save</button>
        </td>
      </tr>
    `;
  });
}

function toggleUserStandard(userId, std, isChecked) {
  const user = adminUsersList.find(u => u.id === userId);
  if (!user) return;
  if (isChecked) {
    if (!user.standards.includes(std)) user.standards.push(std);
  } else {
    user.standards = user.standards.filter(s => s !== std);
  }
}

async function saveUserPermissions(targetUserId) {
  const user = adminUsersList.find(u => u.id === targetUserId);
  if (!user) return;

  const payload = {
    action: "updateUserStandards",
    adminId: currentUser.id,
    targetUserId: targetUserId,
    allowedStandards: user.standards
  };

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Updated permissions for ${user.name}! Allowed standards: Class ${user.standards.join(", ")}`);
    } else {
      alert("Error: " + data.error);
    }
  } catch (err) {
    alert("Network error: " + err.message);
  }
}

function renderAdminTable(list) {
  const tbody = document.getElementById("adminScoresTable");
  tbody.innerHTML = "";
  list.forEach(s => {
    tbody.innerHTML += `
      <tr>
        <td>${s.userId}</td>
        <td>${s.userName}</td>
        <td>Class ${s.standard}</td>
        <td>${s.subject}</td>
        <td>${s.score} / ${s.total}</td>
        <td>${s.date}</td>
      </tr>
    `;
  });
}

function filterAdminReports() {
  const user = document.getElementById("adminFilterUser").value.toLowerCase();
  const std = document.getElementById("adminFilterStd").value;
  const sub = document.getElementById("adminFilterSub").value.toLowerCase();

  const filtered = adminMasterScores.filter(s => {
    const matchUser = !user || s.userId.toLowerCase().includes(user) || s.userName.toLowerCase().includes(user);
    const matchStd = !std || s.standard.toString() === std.toString();
    const matchSub = !sub || s.subject.toLowerCase() === sub;
    return matchUser && matchStd && matchSub;
  });

  renderAdminTable(filtered);
}

async function adminAddNewConfig(type) {
  if (!currentUser || currentUser.role !== "admin") {
    alert("Unauthorized: Only administrators can add standards or subjects.");
    return;
  }

  const input = type === "Standard" ? document.getElementById("adminNewStdInput") : document.getElementById("adminNewSubInput");
  const value = input.value.trim();
  
  if (!value) return alert(`Please enter a valid ${type} name.`);

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "addConfig", userId: currentUser.id, type: type, value: value })
    });
    const data = await res.json();
    
    if (data.success) {
      alert(`✅ ${type} "${value}" created successfully!`);
      input.value = "";
      await loadInitialConfigs();
      renderAdminConfigBadges();
      renderAdminUserPermissionsTable();
    } else {
      alert("Error: " + data.error);
    }
  } catch (err) {
    alert("Network error: " + err.message);
  }
}

function renderAdminConfigBadges() {
  const stdContainer = document.getElementById("adminStdBadgeList");
  const subContainer = document.getElementById("adminSubBadgeList");
  
  if (stdContainer) {
    stdContainer.innerHTML = appConfig.standards
      .map(std => `<span class="badge" style="background:#003366; color:#fff;">Class ${std}</span>`)
      .join(" ");
  }
  
  if (subContainer) {
    subContainer.innerHTML = appConfig.subjects
      .map(sub => `<span class="badge" style="background:#f37021; color:#fff;">${sub}</span>`)
      .join(" ");
  }
}

async function deleteQ(id) {
  if (!confirm("Are you sure you want to delete this question?")) return;
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ action: "deleteQuestion", questionId: id, userId: currentUser.id })
  });
  const data = await res.json();
  if (data.success) {
    alert("Question deleted.");
    await loadInitialConfigs();
    resetQuizView();
  } else {
    alert(data.error);
  }
}