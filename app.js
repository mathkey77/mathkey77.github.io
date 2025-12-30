// ====== 설정: GAS 웹앱 URL ======
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbw0Jry0N4CJbvJCEXmnD6wH_hOLxfv1wpMruNuT6jl3HYONPwzvM9nKogwLMt2G_ttviA/exec";

let courseTopicMap = {};
let currentCourse = "";
let currentTopic = "";
let currentSheetName = "";
let currentQCount = 10;

// ====== 게임 상태 ======
let gameState = {
  questions: [],
  currentIdx: 0,
  score: 0,
  timerInterval: null,
  startTime: 0,
  endTime: 0,
  totalQ: 0
};

// ====== [공통] 화면 전환 유틸 ======
function switchScreen(id) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
  }
  window.scrollTo(0, 0);
}

function getStudentName() {
  const el = document.getElementById('student-name');
  return (el ? el.value : "").trim();
}

// ====== [초기화] 과정 및 토픽 목록 로드 ======
async function initCourseTopicSelect() {
  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getCoursesAndTopics`);
    const json = await res.json();
    if (!json.ok) return;

    courseTopicMap = json.data;
    const cSel = document.getElementById('course-select');
    const tSel = document.getElementById('topic-select');

    if (!cSel || !tSel) return;

    cSel.innerHTML = '<option value="" disabled selected>과정 선택</option>';
    Object.keys(courseTopicMap).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      cSel.appendChild(opt);
    });

    cSel.onchange = () => {
      const topics = courseTopicMap[cSel.value] || [];
      tSel.innerHTML = '<option value="" disabled selected>주제 선택</option>';
      topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        tSel.appendChild(opt);
      });
    };
  } catch (e) {
    console.error("초기 로드 에러:", e);
  }
}

// ====== [개념 조회] 연습 시작 버튼 클릭 시 ======
async function onClickStartBtn() {
  const name = getStudentName();
  if (!name) { alert('이름을 입력하세요!'); return; }

  const course = document.getElementById('course-select').value;
  const topic = document.getElementById('topic-select').value;
  if (!course || !topic) { alert('과정과 주제를 선택하세요!'); return; }

  currentCourse = course;
  currentTopic = topic;
  currentSheetName = `<${course}>${topic}`;
  
  const countRadio = document.querySelector('input[name="q-count"]:checked');
  currentQCount = countRadio ? parseInt(countRadio.value, 10) : 10;

  switchScreen('article-screen');
  
  const titleEl = document.getElementById('article-title');
  const contentBox = document.getElementById('article-content');
  
  if (titleEl) titleEl.innerText = `${course} - ${topic}`;
  if (contentBox) contentBox.innerHTML = '<p style="text-align:center; padding:20px;">내용을 불러오는 중...</p>';

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getDescription&topic=${encodeURIComponent(currentSheetName)}`);
    const json = await res.json();

    if (json.ok && json.data) {
      // 데이터가 객체로 넘어올 경우를 대비해 처리
      const content = (typeof json.data === 'string') ? json.data : JSON.stringify(json.data);
      contentBox.innerHTML = content;
      if (window.renderMathInElement) {
        renderMathInElement(contentBox, {
          delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}],
          throwOnError: false
        });
      }
    } else {
      contentBox.innerHTML = `
        <div style="text-align:center; padding:30px;">
          <p>📝 아직 상세 개념 설명이 등록되지 않았습니다.</p>
          <p style="color:#888; font-size:0.9rem;">바로 문제 풀이를 시작해 보세요!</p>
        </div>`;
    }
  } catch (e) {
    if (contentBox) contentBox.innerHTML = '<p>데이터 로드 오류</p>';
  }
}

// ====== [문제 풀이 시작] 개념 화면 -> 게임 화면 ======
async function onStartQuizFromArticle() {
  switchScreen('game-screen');
  
  const qTextEl = document.getElementById('question-text');
  const choicesEl = document.getElementById('choices-container');
  
  if (qTextEl) qTextEl.innerText = '문제를 불러오는 중입니다...';
  if (choicesEl) choicesEl.innerHTML = '';

  gameState.currentIdx = 0;
  gameState.score = 0;
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);

  try {
    const url = `${GAS_BASE_URL}?action=getGameData&sheetName=${encodeURIComponent(currentSheetName)}&count=${currentQCount}`;
    const res = await fetch(url);
    const json = await res.json();

    console.log("받아온 전체 데이터:", json); // 디버깅용

    if (!json.ok || !json.data || !Array.isArray(json.data) || json.data.length === 0) {
      throw new Error("문제를 불러오지 못했습니다. 시트 이름이나 데이터를 확인하세요.");
    }

    gameState.questions = json.data;
    gameState.totalQ = json.data.length;

    startTimer();
    renderQuestion();
  } catch (e) {
    alert(e.message);
    switchScreen('menu-screen');
  }
}

// ====== [타이머] ======
function startTimer() {
  gameState.startTime = Date.now();
  const sw = document.getElementById('stopwatch');
  
  gameState.timerInterval = setInterval(() => {
    const now = Date.now();
    const diff = (now - gameState.startTime) / 1000;
    const min = Math.floor(diff / 60);
    const sec = Math.floor(diff % 60);
    if (sw) {
      sw.innerText = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
  }, 100);
}

// ====== [문제 렌더링] 핵심 수정 부분 ======
function renderQuestion() {
  const q = gameState.questions[gameState.currentIdx];
  const qTextEl = document.getElementById('question-text');
  const choicesEl = document.getElementById('choices-container');

  if (!qTextEl || !choicesEl) return;

  // 1. q가 유효한지 확인
  if (!q) {
    qTextEl.innerText = "문제를 찾을 수 없습니다.";
    return;
  }

  console.log(`현재 문제(${gameState.currentIdx}):`, q); // 디버깅용

  // 2. 질문 출력 (q가 객체라면 q.question 속성을 사용)
  // [object Object]가 나오는 이유는 객체 자체를 출력하려 했기 때문
const qString = (typeof q === 'object') ? (q.question || q.q) : String(q);
  
  qTextEl.innerHTML = ''; // 초기화
  qTextEl.innerText = qString; 
  choicesEl.innerHTML = '';

  // 3. 보기 출력 (q.choices 배열 확인)
  const choices = Array.isArray(q.choices) ? q.choices : [];
  
  if (choices.length === 0) {
    choicesEl.innerHTML = "<p style='color:red;'>보기가 없습니다. 시트 형식을 확인하세요.</p>";
  } else {
    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      // 보기가 객체일 경우를 대비해 String으로 변환
      btn.innerText = (typeof choice === 'object') ? JSON.stringify(choice) : String(choice);
      btn.onclick = () => handleChoiceClick(choice, q.answer);
      choicesEl.appendChild(btn);
    });
  }

  // 4. 수식 렌더링
  if (window.renderMathInElement) {
    renderMathInElement(qTextEl, {
      delimiters: [{left: '$', right: '$', display: false}],
      throwOnError: false
    });
    renderMathInElement(choicesEl, {
      delimiters: [{left: '$', right: '$', display: false}],
      throwOnError: false
    });
  }
}

// ====== [정답 처리] ======
function handleChoiceClick(selected, correct) {
  // 비교 시 공백 제거 및 문자열 강제 변환
  const s = String(selected).trim();
  const c = String(correct).trim();
  
  if (s === c) {
    gameState.score++;
  }

  gameState.currentIdx++;
  if (gameState.currentIdx < gameState.totalQ) {
    renderQuestion();
  } else {
    endGame();
  }
}

// ====== [게임 종료] ======
function endGame() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  const elapsed = (Date.now() - gameState.startTime) / 1000;

  switchScreen('result-screen');
  
  const metaEl = document.getElementById('result-meta');
  const scoreEl = document.getElementById('final-score');
  const timeEl = document.getElementById('final-time');

  if (metaEl) metaEl.innerText = `${currentCourse} - ${currentTopic}`;
  if (scoreEl) scoreEl.innerText = `${gameState.score} / ${gameState.totalQ}`;
  if (timeEl) timeEl.innerText = `${elapsed.toFixed(2)}초`;
}

// ====== [랭킹 저장] ======
async function onClickSaveScore() {
  const name = getStudentName();
  if (!name) { alert('이름을 입력하세요!'); return; }

  const timeEl = document.getElementById('final-time');
  const timeSec = timeEl ? timeEl.innerText.replace('초', '').trim() : "0";

  try {
    const url = `${GAS_BASE_URL}?action=saveScore&name=${encodeURIComponent(name)}&topic=${encodeURIComponent(currentSheetName)}&totalQ=${gameState.totalQ}&score=${gameState.score}&timeSec=${timeSec}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.ok) alert('랭킹에 등록되었습니다!');
  } catch (e) {
    alert('저장 실패: ' + e.message);
  }
}

// ====== [이벤트 바인딩] ======
window.addEventListener('load', async () => {
  await initCourseTopicSelect();

  const startBtn = document.getElementById('start-btn');
  const quizStartBtn = document.getElementById('go-to-quiz-btn');
  const saveBtn = document.getElementById('save-score-btn');
  const homeBtn = document.getElementById('back-home-btn');

  if (startBtn) startBtn.onclick = onClickStartBtn;
  if (quizStartBtn) quizStartBtn.onclick = onStartQuizFromArticle;
  if (saveBtn) saveBtn.onclick = onClickSaveScore;
  if (homeBtn) homeBtn.onclick = () => switchScreen('menu-screen');
});

