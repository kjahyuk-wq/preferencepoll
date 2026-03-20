import { db } from './firebase-config.js';
import {
  doc, setDoc, deleteDoc, getDocs, collection, onSnapshot, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⚠️ 관리자 비밀번호 (변경 가능)
const ADMIN_PASSWORD = 'hrd2024!';

// 조 이름 기본값
let GROUP_NAMES = ["1조", "2조", "3조", "4조", "5조", "6조", "7조"];

let sessionData = { activeGroup: null, isOpen: false };
let voteData = {}; // { 1: [7, 8, 9, ...], 2: [...], ... }

// 요소 참조
const adminLoginSection = document.getElementById('adminLoginSection');
const adminDashboard = document.getElementById('adminDashboard');
const adminPwInput = document.getElementById('adminPwInput');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const sessionStatus = document.getElementById('sessionStatus');
const groupGrid = document.getElementById('groupGrid');
const resultsBody = document.getElementById('resultsBody');
const closeAllBtn = document.getElementById('closeAllBtn');

// 로그인
adminLoginBtn.addEventListener('click', handleAdminLogin);
adminPwInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAdminLogin(); });

function handleAdminLogin() {
  if (adminPwInput.value === ADMIN_PASSWORD) {
    adminLoginSection.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
    initDashboard();
  } else {
    alert('비밀번호가 틀렸습니다.');
    adminPwInput.value = '';
    adminPwInput.focus();
  }
}

function initDashboard() {
  listenGroupNames();
  listenSession();
  listenVotes();
  initParticipants();
}

// ── 조 이름 관리 ──────────────────────────────────────────
const groupNameEditor   = document.getElementById('groupNameEditor');
const saveGroupNamesBtn = document.getElementById('saveGroupNamesBtn');
const addGroupBtn       = document.getElementById('addGroupBtn');

saveGroupNamesBtn.addEventListener('click', saveGroupNames);
addGroupBtn.addEventListener('click', () => {
  const idx = groupNameEditor.querySelectorAll('.group-name-input').length + 1;
  groupNameEditor.appendChild(makeGroupNameRow(`${idx}조`));
});

function listenGroupNames() {
  onSnapshot(doc(db, 'settings', 'groups'), (snap) => {
    if (snap.exists() && Array.isArray(snap.data().names)) {
      GROUP_NAMES = snap.data().names;
    }
    renderGroupNameInputs();
    buildGroupCards();
  });
}

function renderGroupNameInputs() {
  groupNameEditor.innerHTML = '';
  GROUP_NAMES.forEach(name => groupNameEditor.appendChild(makeGroupNameRow(name)));
}

function makeGroupNameRow(value) {
  const row = document.createElement('div');
  row.className = 'group-name-row';
  row.innerHTML = `
    <div class="row-order-btns">
      <button class="btn-order" data-dir="up" title="위로">▲</button>
      <button class="btn-order" data-dir="down" title="아래로">▼</button>
    </div>
    <input type="text" class="group-name-input" value="${value}" maxlength="20" />
    <button class="btn-del-row" title="삭제">✕</button>
  `;
  row.querySelector('[data-dir="up"]').addEventListener('click', () => {
    const prev = row.previousElementSibling;
    if (prev) groupNameEditor.insertBefore(row, prev);
  });
  row.querySelector('[data-dir="down"]').addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next) groupNameEditor.insertBefore(next, row);
  });
  row.querySelector('.btn-del-row').addEventListener('click', () => {
    if (groupNameEditor.querySelectorAll('.group-name-input').length > 1) row.remove();
  });
  return row;
}

async function saveGroupNames() {
  const names = [...groupNameEditor.querySelectorAll('.group-name-input')]
    .map(i => i.value.trim())
    .filter(n => n);
  if (names.length === 0) return;
  saveGroupNamesBtn.disabled = true;
  saveGroupNamesBtn.textContent = '저장 중...';
  await setDoc(doc(db, 'settings', 'groups'), { names });
  saveGroupNamesBtn.disabled = false;
  saveGroupNamesBtn.textContent = '저장';
}

// 참가자 관리
const pNameInput = document.getElementById('pNameInput');
const pIdInput = document.getElementById('pIdInput');
const addParticipantBtn = document.getElementById('addParticipantBtn');
const participantList = document.getElementById('participantList');

addParticipantBtn.addEventListener('click', addParticipant);
pIdInput.addEventListener('keydown', e => { if (e.key === 'Enter') addParticipant(); });
pNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') pIdInput.focus(); });

async function addParticipant() {
  const name = pNameInput.value.trim();
  const employeeId = pIdInput.value.trim();
  if (!name || !employeeId) {
    alert('이름과 교번을 모두 입력해주세요.');
    return;
  }
  const id = `${name}_${employeeId}`;
  await setDoc(doc(db, 'participants', id), { name, employeeId });
  pNameInput.value = '';
  pIdInput.value = '';
  pNameInput.focus();
}

function initParticipants() {
  onSnapshot(collection(db, 'participants'), (snap) => {
    if (snap.empty) {
      participantList.innerHTML = '<p class="empty-msg">등록된 심사자가 없습니다.</p>';
      return;
    }
    const sorted = snap.docs
      .map(d => d.data())
      .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    participantList.innerHTML = sorted.map(p => `
      <div class="participant-item">
        <span class="p-name">${p.name}</span>
        <span class="p-id">${p.employeeId}</span>
        <button class="btn-del" data-id="${p.name}_${p.employeeId}">삭제</button>
      </div>
    `).join('');
    participantList.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', () => deleteParticipant(btn.dataset.id));
    });
  });
}

async function deleteParticipant(id) {
  if (!confirm('심사자를 삭제하시겠습니까?')) return;
  await Promise.all([
    deleteDoc(doc(db, 'participants', id)),
    deleteDoc(doc(db, 'voters', id)),
  ]);
}

// 엑셀 업로드
const excelFile = document.getElementById('excelFile');
const excelDrop = document.getElementById('excelDrop');

excelFile.addEventListener('change', e => handleExcel(e.target.files[0]));

excelDrop.addEventListener('dragover', e => { e.preventDefault(); excelDrop.classList.add('drag-over'); });
excelDrop.addEventListener('dragleave', () => excelDrop.classList.remove('drag-over'));
excelDrop.addEventListener('drop', e => {
  e.preventDefault();
  excelDrop.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleExcel(file);
});

async function handleExcel(file) {
  if (!file) return;
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let count = 0;
    const promises = [];
    for (const row of rows) {
      const employeeId = String(row[0] ?? '').trim();
      const name = String(row[1] ?? '').trim();
      if (!employeeId || !name) continue;
      promises.push(setDoc(doc(db, 'participants', `${name}_${employeeId}`), { name, employeeId }));
      count++;
    }
    await Promise.all(promises);
    alert(`✅ ${count}명의 심사자가 등록되었습니다.`);
    excelFile.value = '';
  } catch (err) {
    alert('파일 처리 중 오류가 발생했습니다. 엑셀 형식을 확인해주세요.');
    console.error(err);
  }
}

function buildGroupCards() {
  groupGrid.innerHTML = '';
  GROUP_NAMES.forEach((name, i) => {
    const group = i + 1;
    const card = document.createElement('div');
    card.className = 'group-card';
    card.id = `groupCard${group}`;
    card.innerHTML = `
      <div class="group-name">${name}</div>
      <div class="group-stats">
        <div class="stat">
          <span class="stat-label">투표 수</span>
          <span class="stat-value" id="voteCount${group}">0표</span>
        </div>
        <div class="stat">
          <span class="stat-label">평균 점수</span>
          <span class="stat-value" id="avgScore${group}">-</span>
        </div>
      </div>
      <div id="groupStatus${group}" class="group-status-badge hidden">🟢 투표 중</div>
      <button class="btn btn-blue btn-open" id="openBtn${group}">투표 열기</button>
      <button class="btn btn-red btn-close hidden" id="closeBtn${group}">투표 닫기</button>
    `;
    groupGrid.appendChild(card);

    card.querySelector('.btn-open').addEventListener('click', () => openVoting(group));
    card.querySelector('.btn-close').addEventListener('click', closeVoting);
  });
}

async function openVoting(group) {
  await setDoc(doc(db, 'session', 'current'), {
    activeGroup: group,
    isOpen: true
  });
}

async function closeVoting() {
  const nextGroup = sessionData.activeGroup < GROUP_NAMES.length
    ? sessionData.activeGroup + 1
    : null;
  await setDoc(doc(db, 'session', 'current'), {
    activeGroup: nextGroup,
    isOpen: false
  });
}

closeAllBtn.addEventListener('click', closeVoting);

// 초기화
const resetBtn        = document.getElementById('resetBtn');
const resetModal      = document.getElementById('resetModal');
const resetCancelBtn  = document.getElementById('resetCancelBtn');
const resetConfirmBtn = document.getElementById('resetConfirmBtn');

resetBtn.addEventListener('click', () => resetModal.classList.remove('hidden'));
resetCancelBtn.addEventListener('click', () => resetModal.classList.add('hidden'));
resetModal.addEventListener('click', e => { if (e.target === resetModal) resetModal.classList.add('hidden'); });

resetConfirmBtn.addEventListener('click', async () => {
  resetConfirmBtn.disabled = true;
  resetConfirmBtn.textContent = '초기화 중...';
  try {
    const [votesSnap, votersSnap] = await Promise.all([
      getDocs(collection(db, 'votes')),
      getDocs(collection(db, 'voters'))
    ]);
    const batch = writeBatch(db);
    votesSnap.forEach(d => batch.delete(d.ref));
    votersSnap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    resetModal.classList.add('hidden');
  } finally {
    resetConfirmBtn.disabled = false;
    resetConfirmBtn.textContent = '초기화';
  }
});

// ── 탭 전환 ─────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// ── 결과 발표 ─────────────────────────────────────────────
const sessionBadge     = document.getElementById('sessionBadge');
const revealBtn        = document.getElementById('revealBtn');
const countdownOverlay = document.getElementById('countdownOverlay');
const cdText           = document.getElementById('cdText');
const resultsSection   = document.getElementById('resultsSection');
const othersGrid       = document.getElementById('othersGrid');
const top3Grid         = document.getElementById('top3Grid');
const top3Announcement = document.getElementById('top3Announcement');
const resultsBackBtn   = document.getElementById('resultsBackBtn');

revealBtn.addEventListener('click', startReveal);
resultsBackBtn.addEventListener('click', () => {
  resultsSection.classList.add('hidden');
  revealBtn.disabled = false;
});

function updateSessionBadge() {
  const { activeGroup, isOpen } = sessionData;
  if (isOpen && activeGroup) {
    sessionBadge.textContent = `🟢 현재 투표 중: ${GROUP_NAMES[activeGroup - 1]}`;
    sessionBadge.className = 'session-badge open';
  } else {
    sessionBadge.textContent = '🔴 투표 대기 중';
    sessionBadge.className = 'session-badge waiting';
  }
}

async function startReveal() {
  revealBtn.disabled = true;
  countdownOverlay.classList.remove('hidden');

  for (const step of ['5', '4', '3', '2', '1', '결과 발표!']) {
    await showCdStep(step);
  }
  countdownOverlay.classList.add('hidden');

  const sorted = buildSortedResults();
  buildResultCards(sorted);
  resultsSection.classList.remove('hidden');

  // Phase 1: 하위권 한꺼번에 등장
  await delay(300);
  othersGrid.querySelectorAll('.others-card').forEach(c => c.classList.add('visible'));

  // Phase 2: TOP 3 예고
  await delay(2000);
  top3Announcement.classList.remove('hidden');
  await delay(100); // reflow
  top3Announcement.classList.add('show');

  // Phase 3: 3위 → 2위 → 1위 순차 공개
  await delay(2000);
  revealTop3Card(3);
  await delay(3000);
  revealTop3Card(2);
  await delay(3500);
  revealTop3Card(1);
  await delay(500);
  document.querySelector('.top3-card[data-rank="1"]')?.classList.add('champion');
}

function showCdStep(text) {
  return new Promise(resolve => {
    cdText.textContent = text;
    cdText.className = 'cd-text animate';
    const isLabel = isNaN(Number(text));
    setTimeout(() => {
      cdText.className = 'cd-text fade-out';
      setTimeout(resolve, isLabel ? 1000 : 300);
    }, isLabel ? 1200 : 700);
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function buildSortedResults() {
  const results = GROUP_NAMES.map((name, i) => {
    const group = i + 1;
    const scores = voteData[group] || [];
    const count = scores.length;
    const avg = count > 0 ? scores.reduce((a, b) => a + b, 0) / count : 0;
    return { group, name, count, avg };
  });
  return results.sort((a, b) => {
    if (a.count === 0 && b.count === 0) return a.group - b.group;
    if (a.count === 0) return 1;
    if (b.count === 0) return -1;
    return b.avg - a.avg || b.count - a.count;
  });
}

function buildResultCards(sorted) {
  const rankMap = {};
  let rankIdx = 0;
  for (const r of sorted) {
    if (r.count > 0) rankMap[r.group] = ++rankIdx;
  }

  const top3Groups = new Set(
    sorted.filter(r => rankMap[r.group] && rankMap[r.group] <= 3).map(r => r.group)
  );
  const others = sorted.filter(r => !top3Groups.has(r.group));
  const top3    = sorted.filter(r =>  top3Groups.has(r.group));

  // 하위권: 순위 없이 조용히
  othersGrid.innerHTML = others.length ? others.map(r => `
    <div class="others-card">
      <span class="others-name">${r.name}</span>
      <span class="others-score">${r.count > 0 ? r.avg.toFixed(1) + '점' : '-'}</span>
    </div>`).join('') : '';

  // 상위권: 포디움 배치 (3위 | 1위 | 2위)
  const byRank = {};
  top3.forEach(r => { byRank[rankMap[r.group]] = r; });
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  // 포디움 열 순서: 3위(왼쪽) → 1위(가운데) → 2위(오른쪽)
  const podium = [byRank[3], byRank[1], byRank[2]].filter(Boolean);

  top3Grid.innerHTML = podium.map(r => {
    const rank = rankMap[r.group];
    const bar = r.count > 0 ? Math.round((r.avg / 10) * 100) : 0;
    return `
      <div class="top3-card rank-${rank}" data-rank="${rank}" id="t3card-${r.group}">
        <div class="t3-rank-badge">${rank}위</div>
        <div class="t3-medal">${medals[rank]}</div>
        <div class="t3-name">${r.name}</div>
        <div class="t3-score">${r.count > 0 ? r.avg.toFixed(1) : '-'}<span class="t3-unit">점</span></div>
        <div class="t3-votes">${r.count}표</div>
        <div class="bar-wrap"><div class="bar" style="--bar: ${bar}%"></div></div>
      </div>`;
  }).join('');
}

function revealTop3Card(rank) {
  const card = document.querySelector(`.top3-card[data-rank="${rank}"]`);
  if (!card) return;
  card.classList.add('visible');
}

function listenSession() {
  onSnapshot(doc(db, 'session', 'current'), (snap) => {
    sessionData = snap.exists() ? snap.data() : { activeGroup: null, isOpen: false };
    updateSessionUI();
    updateSessionBadge();
  });
}

function listenVotes() {
  onSnapshot(collection(db, 'votes'), (snap) => {
    voteData = {};
    snap.forEach(d => {
      const { group, score } = d.data();
      if (!voteData[group]) voteData[group] = [];
      voteData[group].push(score);
    });
    updateResultsUI();
  });
}

function updateSessionUI() {
  const { activeGroup, isOpen } = sessionData;

  if (isOpen && activeGroup) {
    sessionStatus.innerHTML = `🟢 현재 투표 중: <strong>${GROUP_NAMES[activeGroup - 1]}</strong>`;
    sessionStatus.className = 'session-status open';
  } else {
    sessionStatus.textContent = '🔴 현재 진행 중인 투표 없음';
    sessionStatus.className = 'session-status';
  }

  GROUP_NAMES.forEach((_, i) => {
    const group = i + 1;
    const card = document.getElementById(`groupCard${group}`);
    const badge = document.getElementById(`groupStatus${group}`);
    const openBtn = document.getElementById(`openBtn${group}`);
    const closeBtn = document.getElementById(`closeBtn${group}`);

    const isActive = isOpen && activeGroup === group;
    card.classList.toggle('active', isActive);
    badge.classList.toggle('hidden', !isActive);
    openBtn.classList.toggle('hidden', isActive);
    closeBtn.classList.toggle('hidden', !isActive);
  });
}

function updateResultsUI() {
  // 조별 카드 업데이트
  GROUP_NAMES.forEach((_, i) => {
    const group = i + 1;
    const scores = voteData[group] || [];
    const count = scores.length;
    const avg = count > 0
      ? (scores.reduce((a, b) => a + b, 0) / count).toFixed(1)
      : null;

    document.getElementById(`voteCount${group}`).textContent = `${count}표`;
    document.getElementById(`avgScore${group}`).textContent = avg ? `${avg}점` : '-';
  });

  // 결과 테이블 (평균 기준 정렬)
  const results = GROUP_NAMES.map((name, i) => {
    const group = i + 1;
    const scores = voteData[group] || [];
    const count = scores.length;
    const avg = count > 0 ? scores.reduce((a, b) => a + b, 0) / count : 0;
    return { group, name, count, avg };
  });

  const sorted = [...results].sort((a, b) => b.avg - a.avg || b.count - a.count);
  const rankMap = {};
  sorted.forEach((r, i) => {
    rankMap[r.group] = r.count > 0 ? i + 1 : '-';
  });

  resultsBody.innerHTML = results.map(r => `
    <tr class="${rankMap[r.group] === 1 ? 'rank-1' : ''}">
      <td><strong>${r.name}</strong></td>
      <td>${r.count}표</td>
      <td>${r.count > 0 ? r.avg.toFixed(1) + '점' : '-'}</td>
      <td class="rank-cell">${rankMap[r.group] === 1 ? '🥇 1위' : rankMap[r.group] === '-' ? '-' : rankMap[r.group] + '위'}</td>
    </tr>
  `).join('');
}
