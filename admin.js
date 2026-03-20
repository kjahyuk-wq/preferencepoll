import { db } from './firebase-config.js';
import {
  doc, setDoc, collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⚠️ 관리자 비밀번호 (변경 가능)
const ADMIN_PASSWORD = 'hrd2024!';

// 조 이름 설정 (필요시 수정)
const GROUP_NAMES = ["1조", "2조", "3조", "4조", "5조", "6조", "7조"];

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
  buildGroupCards();
  listenSession();
  listenVotes();
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
  await setDoc(doc(db, 'session', 'current'), {
    activeGroup: null,
    isOpen: false
  });
}

closeAllBtn.addEventListener('click', closeVoting);

function listenSession() {
  onSnapshot(doc(db, 'session', 'current'), (snap) => {
    sessionData = snap.exists() ? snap.data() : { activeGroup: null, isOpen: false };
    updateSessionUI();
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
