import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, addDoc,
  collection, onSnapshot, arrayUnion, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let GROUP_NAMES = ["1조", "2조", "3조", "4조", "5조", "6조", "7조"];

onSnapshot(doc(db, 'settings', 'groups'), (snap) => {
  if (snap.exists() && Array.isArray(snap.data().names)) {
    GROUP_NAMES = snap.data().names;
  }
});

let currentUser = null;
let selectedScore = null;
let currentGroup = null;
let sessionUnsubscribe = null;

// 요소 참조
const loginSection = document.getElementById('loginSection');
const votingSection = document.getElementById('votingSection');
const nameInput = document.getElementById('nameInput');
const idInput = document.getElementById('idInput');
const loginBtn = document.getElementById('loginBtn');
const welcomeMsg = document.getElementById('welcomeMsg');
const logoutBtn  = document.getElementById('logoutBtn');
const waitingMsg = document.getElementById('waitingMsg');
const votingBox = document.getElementById('votingBox');
const alreadyVoted = document.getElementById('alreadyVoted');
const voteSuccess = document.getElementById('voteSuccess');
const groupLabel = document.getElementById('groupLabel');
const scoreGrid = document.getElementById('scoreGrid');
const selectedDisplay = document.getElementById('selectedDisplay');
const submitBtn = document.getElementById('submitBtn');

// 이전 세션 복원
const saved = sessionStorage.getItem('voter');
if (saved) {
  currentUser = JSON.parse(saved);
  showVotingSection();
}

// 로그인 이벤트
loginBtn.addEventListener('click', handleLogin);
idInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') idInput.focus(); });

async function handleLogin() {
  const name = nameInput.value.trim();
  const employeeId = idInput.value.trim();
  if (!name || !employeeId) {
    alert('이름과 교번을 모두 입력해주세요.');
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = '확인 중...';
  try {
    const snap = await getDoc(doc(db, 'participants', `${name}_${employeeId}`));
    if (!snap.exists()) {
      alert('등록되지 않은 이름 또는 교번입니다.\n관리자에게 문의하세요.');
      loginBtn.disabled = false;
      loginBtn.textContent = '입장하기';
      return;
    }
    currentUser = { name, employeeId, voterId: `${name}_${employeeId}` };
    sessionStorage.setItem('voter', JSON.stringify(currentUser));
    showVotingSection();
  } catch (e) {
    alert('오류가 발생했습니다. 다시 시도해주세요.');
    loginBtn.disabled = false;
    loginBtn.textContent = '입장하기';
  }
}

logoutBtn.addEventListener('click', () => {
  if (sessionUnsubscribe) sessionUnsubscribe();
  sessionStorage.removeItem('voter');
  currentUser = null;
  votingSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
  loginBtn.disabled = false;
  loginBtn.textContent = '입장하기';
  nameInput.value = '';
  idInput.value = '';
  nameInput.focus();
});

function showVotingSection() {
  loginSection.classList.add('hidden');
  votingSection.classList.remove('hidden');
  welcomeMsg.innerHTML = `<p class="welcome">안녕하세요, <strong>${currentUser.name}</strong>님 👋</p>`;
  buildScoreGrid();
  listenSession();
}

function buildScoreGrid() {
  scoreGrid.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'score-btn';
    btn.textContent = i;
    btn.addEventListener('click', () => selectScore(i));
    scoreGrid.appendChild(btn);
  }
}

function selectScore(score) {
  selectedScore = score;
  document.querySelectorAll('.score-btn').forEach((btn, idx) => {
    btn.classList.toggle('selected', idx + 1 === score);
  });
  selectedDisplay.textContent = `선택한 점수: ${score}점`;
  selectedDisplay.classList.remove('hidden');
  submitBtn.classList.remove('hidden');
}

function listenSession() {
  if (sessionUnsubscribe) sessionUnsubscribe();
  sessionUnsubscribe = onSnapshot(doc(db, 'session', 'current'), async (snap) => {
    const data = snap.exists() ? snap.data() : {};
    if (!data.isOpen || !data.activeGroup) {
      const groupName = data.activeGroup ? GROUP_NAMES[data.activeGroup - 1] : null;
      showState('waiting', groupName);
      return;
    }
    const { activeGroup } = snap.data();
    currentGroup = activeGroup;
    groupLabel.textContent = `📢 현재 발표 중: ${GROUP_NAMES[activeGroup - 1]}`;

    const voted = await hasVoted(activeGroup);
    showState(voted ? 'alreadyVoted' : 'voting', GROUP_NAMES[activeGroup - 1]);
  });
}

async function hasVoted(group) {
  const snap = await getDoc(doc(db, 'voters', currentUser.voterId));
  if (!snap.exists()) return false;
  return (snap.data().votedGroups || []).includes(group);
}

const successGroupName  = document.getElementById('successGroupName');
const alreadyGroupName  = document.getElementById('alreadyGroupName');
const waitingPresenting = document.getElementById('waitingPresenting');
const waitingIdle       = document.getElementById('waitingIdle');
const waitingGroupName  = document.getElementById('waitingGroupName');

function showState(state, groupName = '') {
  waitingMsg.classList.add('hidden');
  votingBox.classList.add('hidden');
  alreadyVoted.classList.add('hidden');
  voteSuccess.classList.add('hidden');

  if (state === 'waiting') {
    if (groupName) {
      waitingGroupName.textContent = groupName;
      waitingPresenting.classList.remove('hidden');
      waitingIdle.classList.add('hidden');
    } else {
      waitingPresenting.classList.add('hidden');
      waitingIdle.classList.remove('hidden');
    }
    waitingMsg.classList.remove('hidden');
  } else if (state === 'voting') {
    votingBox.classList.remove('hidden');
    // 점수 초기화
    selectedScore = null;
    selectedDisplay.classList.add('hidden');
    submitBtn.classList.add('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = '투표 제출하기';
    document.querySelectorAll('.score-btn').forEach(btn => btn.classList.remove('selected'));
  } else if (state === 'alreadyVoted') {
    alreadyGroupName.textContent = groupName;
    alreadyVoted.classList.remove('hidden');
  } else if (state === 'success') {
    successGroupName.textContent = groupName;
    voteSuccess.classList.remove('hidden');
  }
}

submitBtn.addEventListener('click', async () => {
  if (!selectedScore || !currentGroup) return;

  submitBtn.disabled = true;
  submitBtn.textContent = '제출 중...';

  try {
    // 이중 체크
    if (await hasVoted(currentGroup)) {
      showState('alreadyVoted');
      return;
    }

    // 익명 투표 저장 (이름/교번 없이 점수만)
    await addDoc(collection(db, 'votes'), {
      group: currentGroup,
      score: selectedScore,
      timestamp: serverTimestamp()
    });

    // 투표자 기록 (중복 방지용, 점수와 연결 안 됨)
    await setDoc(doc(db, 'voters', currentUser.voterId), {
      votedGroups: arrayUnion(currentGroup)
    }, { merge: true });

    showState('success', GROUP_NAMES[currentGroup - 1]);
  } catch (e) {
    console.error(e);
    alert('오류가 발생했습니다. 다시 시도해주세요.');
    submitBtn.disabled = false;
    submitBtn.textContent = '투표 제출하기';
  }
});
