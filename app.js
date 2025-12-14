// ====== 설정: GAS 웹앱 URL (중복 선언 금지) ======
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbz6HWeqigabHzESTi0iuNrlVPsL2O5xUgQFftx9YOydq4wsiYWLvAdtkDXvOwAEpSjNGA/exec";

let courseTopicMap = {};

// 현재 선택 상태(랭킹 저장/조회에 필요)
let currentCourse = "";
let currentTopic = "";
let currentSheetName = "";
let currentQCount = 5;

// ====== 게임 상태 ======
let gameState = {
  questions: [],
  currentIdx: 0,
  score: 0,
  timerInterval: null,
  startTime: 0,
  endTime: 0,
  totalQ: 0,
  timeLimit: 0
};

// ====== 유틸 ======
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function getStudentName() {
  const el = document.getElementById('student-name');
  return (el ? el.value : "").trim();
}

// GAS가 {ok,data}로 오든, 그냥 맵/배열로 오든 안전 파싱
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json && typeof json === 'object' && 'ok' in json) {
    if (!json.ok) throw new Error(json.error || 'GAS error');
    return json.data;
  }
  // 구형 포맷(out.data)도 흡수
  if (json && typeof json === 'object' && 'data' in json && Object.keys(json).length <= 5) return json.data;
  return json;
}

// ====== GAS API ======
async function apiTest() {
  const url = `${GAS_BASE_URL}?action=test`;
  return await fetchJson(url);
}

async function fetchCoursesAndTopics() {
  const url = `${GAS_BASE_URL}?action=getCoursesAndTopics`;
  return await fetchJson(url); // { "초등": ["분수의 덧셈", ...], ... }
}

async function fetchGameData(sheetName, count) {
  const url = `${GAS_BASE_URL}?action=getGameData&sheetName=${encodeURIComponent(sheetName)}&count=${count}`;
  return await fetchJson(url); // [ {q, choices:[{text,isCorrect}...]} ... ]
}

async function saveScoreToRanking(name, topicKey, totalQ, score, timeSec) {
  const url =
    `${GAS_BASE_URL}?action=saveScore` +
    `&name=${encodeURIComponent(name)}` +
    `&topic=${encodeURIComponent(topicKey)}` +
    `&totalQ=${encodeURIComponent(totalQ)}` +
    `&score=${encodeURIComponent(score)}` +
    `&timeSec=${encodeURIComponent(timeSec)}`;

  // 저장은 결과값 자체보다 성공/실패만 중요
  await fetchJson(url);
}

async function fetchRankings(topicKey, qCount) {
  const url =
    `${GAS_BASE_URL}?action=getRankings` +
    `&topic=${encodeURIComponent(topicKey)}` +
    `&qCount=${encodeURIComponent(qCount)}`;
  return await fetchJson(url); // [{name,topic,qCount,score,time}, ...]
}

// ====== 타이머 ======
function updateTimerDisplay(sec) {
  const safeSec = Math.max(0, sec);
  const m = Math.floor(safeSec / 60).toString().padStart(2, '0');
  const s = (safeSec % 60).toString().padStart(2, '0');
  document.getElementById('timer').innerText = `${m}:${s}`;

  const ratio = gameState.timeLimit > 0 ? safeSec / gameState.timeLimit : 0;
  document.getElementById('time-bar').style.width = (ratio * 100) + '%';
  document.getElementById('timer').style.color = safeSec < 10 ? '#ef4444' : '#fbbf24';
}

function startTimer(limitSec) {
  clearInterval(gameState.timerInterval);
  gameState.startTime = new Date();
  gameState.timeLimit = limitSec;

  let remaining = limitSec;
  updateTimerDisplay(remaining);

  gameState.timerInterval = setInterval(() => {
    remaining--;
    updateTimerDisplay(remaining);
    if (remaining <= 0) finishGame();
  }, 1000);
}

// ====== 렌더링 ======
function renderQuestion() {
  const qData = gameState.questions[gameState.currentIdx];

  document.getElementById('q-progress').innerText =
    `${gameState.currentIdx + 1}/${gameState.totalQ}`;

  const qBox = document.getElementById('question-text');
  qBox.innerHTML = qData.q;

  const cContainer = document.getElementById('choices-container');
  cContainer.innerHTML = '';

  qData.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerHTML = choice.text;
    btn.onclick = () => checkAnswer(choice.isCorrect);
    cContainer.appendChild(btn);
  });

  // KaTeX 렌더
  try {
    renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\(", right: "\\)", display: false }
      ]
    });
  } catch (e) {
    console.error(e);
  }
}

function checkAnswer(isCorrect) {
  if (isCorrect) gameState.score++;
  gameState.currentIdx++;

  if (gameState.currentIdx < gameState.totalQ) renderQuestion();
  else finishGame();
}

// ====== 게임 종료 ======
function finishGame() {
  clearInterval(gameState.timerInterval);
  gameState.endTime = new Date();

  const elapsed = ((gameState.endTime - gameState.startTime) / 1000).toFixed(3);

  document.getElementById('final-score').innerText = `${gameState.score} / ${gameState.totalQ}`;
  document.getElementById('final-time').innerText = `${elapsed}초`;

  // 결과 화면으로 이동
  switchScreen('result-screen');
}

// ====== 랭킹 화면 ======
function renderRankingTable(rows) {
  const wrap = document.getElementById('ranking-table-wrap');

  if (!rows || rows.length === 0) {
    wrap.innerHTML = `<div style="padding:12px;">아직 기록이 없습니다.</div>`;
    return;
  }

  const html = `
    <table class="ranking-table">
      <thead>
        <tr>
          <th>순위</th>
          <th>이름</th>
          <th>점수</th>
          <th>시간(초)</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${String(r.name)}</td>
            <td>${r.score} / ${r.qCount}</td>
            <td>${Number(r.time).toFixed(3)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.innerHTML = html;
}


async function openRankingScreen() {
  const topicKey = currentSheetName; // "<과정>주제" 그대로 저장/조회 키로 사용
  const qCount = currentQCount;

  document.getElementById('ranking-meta').innerText =
    `${topicKey} · ${qCount}문제`;

  switchScreen('ranking-screen');

  try {
    const rows = await fetchRankings(topicKey, qCount);
    renderRankingTable(rows);
  } catch (e) {
    document.getElementById('ranking-table-wrap').innerHTML =
      `<div style="padding:12px;">랭킹 로드 실패: ${e.message}</div>`;
  }
}

// ====== 과정/토픽 셀렉트 초기화 ======
async function initCourseTopicSelect() {
  const courseSel = document.getElementById('course-select');
  const topicSel = document.getElementById('topic-select');

  // select는 innerHTML로 option을 넣는 방식이 안전
  courseSel.innerHTML = `<option value="" disabled selected>로딩 중...</option>`;
  topicSel.innerHTML = `<option value="" disabled selected>과정을 먼저 선택하세요</option>`;

  // 배포/권한 문제인지 먼저 test로 확인(실패 시 원인 파악 쉬움)
  await apiTest();

  courseTopicMap = await fetchCoursesAndTopics();

  courseSel.innerHTML = `<option value="" disabled selected>과정을 선택하세요</option>`;
  Object.keys(courseTopicMap).forEach(course => {
    const opt = document.createElement('option');
    opt.value = course;
    opt.innerText = course;
    courseSel.appendChild(opt);
  });

  courseSel.addEventListener('change', () => {
    const c = courseSel.value;
    topicSel.innerHTML = `<option value="" disabled selected>토픽을 선택하세요</option>`;

    if (!c || !courseTopicMap[c]) return;

    courseTopicMap[c].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.innerText = t;
      topicSel.appendChild(opt);
    });
  });
}

// ====== 게임 시작 ======
async function startGame() {
  const name = getStudentName();
  if (!name) {
    alert('이름을 입력하세요!');
    document.getElementById('student-name').focus();
    return;
  }

  const course = document.getElementById('course-select').value;
  const topic = document.getElementById('topic-select').value;

  const countRadio = document.querySelector('input[name="q-count"]:checked');
  const count = countRadio ? parseInt(countRadio.value, 10) : 5;

  if (!course || !topic) {
    alert('과정과 토픽을 모두 선택하세요!');
    return;
  }

  // 현재 선택값 저장(랭킹 저장/조회에 사용)
  currentCourse = course;
  currentTopic = topic;
  currentSheetName = `<${course}>${topic}`; // 시트명과 동일한 키를 랭킹 topic으로 저장
  currentQCount = count;

  switchScreen('game-screen');
  document.getElementById('question-text').innerText = '문제를 불러오는 중...';
  document.getElementById('choices-container').innerHTML = '';

  try {
    const data = await fetchGameData(currentSheetName, count);

    gameState.questions = data;
    gameState.currentIdx = 0;
    gameState.score = 0;
    gameState.totalQ = data.length;

    startTimer(gameState.totalQ * 10);
    renderQuestion();
  } catch (e) {
    alert('문제를 불러오지 못했습니다: ' + e.message);
    switchScreen('menu-screen');
  }
}

// ====== 결과: 랭킹 저장 ======
async function onClickSaveScore() {
  const name = getStudentName();
  if (!name) {
    alert('이름을 입력하세요!');
    switchScreen('menu-screen');
    return;
  }

  // 결과화면의 elapsed 문자열("12.345초")에서 숫자만 추출
  const elapsedText = document.getElementById('final-time').innerText;
  const timeSec = String(elapsedText).replace('초', '').trim();

  try {
    await saveScoreToRanking(name, currentSheetName, currentQCount, gameState.score, timeSec);
    alert('랭킹에 저장되었습니다!');
  } catch (e) {
    alert('랭킹 저장 실패: ' + e.message);
  }
}

// ====== 이벤트 바인딩 ======
window.addEventListener('load', async () => {
  try {
    await initCourseTopicSelect();
  } catch (e) {
    alert(
      '초기화 실패(배포/권한/URL 확인 필요): ' + e.message +
      '\n- GAS 웹앱 URL이 exec인지\n- "웹 앱" 배포에서 액세스가 "모든 사용자"인지\n- 스프레드시트 접근 권한 승인됐는지'
    );
  }

  document.getElementById('start-btn').addEventListener('click', startGame);

  document.getElementById('back-home-btn').addEventListener('click', () => switchScreen('menu-screen'));
  document.getElementById('back-home-btn-2').addEventListener('click', () => switchScreen('menu-screen'));
  document.getElementById('back-result-btn').addEventListener('click', () => switchScreen('result-screen'));

  document.getElementById('save-score-btn').addEventListener('click', onClickSaveScore);
  document.getElementById('view-ranking-btn').addEventListener('click', openRankingScreen);
});

