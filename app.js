// ====== 설정: GAS 웹앱 URL ======
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbwc5Ke-k4Phf736PN8EhkdoTzlTX0ifB0h4HxTbI91TUCPHvnH-wAEaniohMWFbZ3xv/exec";

const GAS_BASE_URL = "…/exec";

let courseTopicMap = {};  // 이제 시트에서 받아온 값으로 채움


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

// ====== 화면 전환 ======
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
async function fetchCoursesAndTopics() {
  const url = `${GAS_BASE_URL}?action=getCoursesAndTopics`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('과정/토픽 목록 로드 실패');
  return await res.json(); // { "초등": ["분수의 덧셈", ...], ... }
}

// ====== 타이머 관련 ======
function updateTimerDisplay(sec) {
  const safeSec = Math.max(0, sec);
  const m = Math.floor(safeSec / 60).toString().padStart(2,'0');
  const s = (safeSec % 60).toString().padStart(2,'0');
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
    if (remaining <= 0) {
      finishGame();
    }
  }, 1000);
}

// ====== GAS에서 데이터 가져오기 ======
async function fetchGameData(sheetName, count) {
  const url = `${GAS_BASE_URL}?action=getGameData&sheetName=${encodeURIComponent(sheetName)}&count=${count}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('게임 데이터 로드 실패');
  return await res.json();
}

// ====== 문제 렌더링 ======
function renderQuestion() {
  const qData = gameState.questions[gameState.currentIdx];
  document.getElementById('q-progress').innerText = `${gameState.currentIdx+1}/${gameState.totalQ}`;

  const qBox = document.getElementById('question-text');
  qBox.textContent = '';
  qBox.innerHTML = qData.q;

  const cContainer = document.getElementById('choices-container');
  cContainer.innerHTML = '';
  qData.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = '';
    btn.innerHTML = choice.text;
    btn.onclick = () => checkAnswer(choice.isCorrect);
    cContainer.appendChild(btn);
  });

  // KaTeX 렌더
  try {
    renderMathInElement(document.body, {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "\\(", right: "\\)", display: false}
      ]
    });
  } catch (e) {
    console.error(e);
  }
}

function checkAnswer(isCorrect) {
  if (isCorrect) gameState.score++;
  gameState.currentIdx++;
  if (gameState.currentIdx < gameState.totalQ) {
    renderQuestion();
  } else {
    finishGame();
  }
}

// ====== 게임 종료 ======
function finishGame() {
  clearInterval(gameState.timerInterval);
  gameState.endTime = new Date();
  const diffMs = gameState.endTime - gameState.startTime;
  const elapsed = (diffMs / 1000).toFixed(3);

  document.getElementById('final-score').innerText = `${gameState.score} / ${gameState.totalQ}`;
  document.getElementById('final-time').innerText = `${elapsed}초`;

  switchScreen('result-screen');
}

// ====== 과정/토픽 셀렉트 초기화 ======
async function initCourseTopicSelect() {
  const courseSel = document.getElementById('course-select');
  const topicSel = document.getElementById('topic-select');

  courseSel.innerHTML = '<option value="" disabled selected>로딩 중...</option>';
  topicSel.innerHTML  = '<option value="" disabled>과정을 먼저 선택하세요</option>';

  try {
    courseTopicMap = await fetchCoursesAndTopics();

    courseSel.innerHTML = '<option value="" disabled selected>과정을 선택하세요</option>';
    Object.keys(courseTopicMap).forEach(course => {
      const opt = document.createElement('option');
      opt.value = course;
      opt.innerText = course;
      courseSel.appendChild(opt);
    });

    courseSel.addEventListener('change', () => {
      const c = courseSel.value;
      topicSel.innerHTML = '';
      if (!c || !courseTopicMap[c]) {
        topicSel.innerHTML = '<option value="" disabled selected>과정을 먼저 선택하세요</option>';
        return;
      }
      courseTopicMap[c].forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.innerText = t;
        topicSel.appendChild(opt);
      });
    });

  } catch (e) {
    alert('과정/토픽 목록을 불러오지 못했습니다: ' + e.message);
    courseSel.innerHTML = '<option value="" disabled selected>에러</option>';
  }
}


// ====== 게임 시작 ======
async function startGame() {
  const course = document.getElementById('course-select').value;
  const topic = document.getElementById('topic-select').value;
  const countRadio = document.querySelector('input[name="q-count"]:checked');
  const count = countRadio ? parseInt(countRadio.value) : 5;

  if (!course || !topic) {
    alert('과정과 토픽을 모두 선택하세요!');
    return;
  }

  const sheetName = `<${course}>${topic}`;

  switchScreen('game-screen');
  document.getElementById('question-text').innerText = '문제를 불러오는 중...';
  document.getElementById('choices-container').innerHTML = '';

  try {
    const data = await fetchGameData(sheetName, count);
    gameState.questions = data;
    gameState.currentIdx = 0;
    gameState.score = 0;
    gameState.totalQ = data.length;

    startTimer(gameState.totalQ * 10); // 문제당 10초
    renderQuestion();
  } catch (e) {
    alert('문제를 불러오지 못했습니다: ' + e.message);
    switchScreen('menu-screen');
  }
}

// ====== 이벤트 바인딩 ======
window.addEventListener('load', () => {
  initCourseTopicSelect();
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('back-home-btn').addEventListener('click', () => {
    switchScreen('menu-screen');
  });
});
