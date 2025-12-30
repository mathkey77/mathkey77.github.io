// ====== 설정: GAS 웹앱 URL (중복 선언 금지) ======
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

  // 1. 개념 화면으로 전환
  switchScreen('article-screen');
  document.getElementById('article-title').innerText = `${course} - ${topic}`;
  const contentBox = document.getElementById('article-content');
  contentBox.innerHTML = '<p style="text-align:center; padding:20px;">내용을 불러오는 중...</p>';

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getDescription&topic=${encodeURIComponent(currentSheetName)}`);
    const json = await res.json();

    if (json.ok && json.data) {
      contentBox.innerHTML = json.data;
      // 수식 렌더링
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
    contentBox.innerHTML = '<p>개념을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// ====== [문제 풀이 시작] 개념 화면 -> 게임 화면 ======
async function onStartQuizFromArticle() {
  // 1. 게임 화면으로 즉시 이동 (로딩 표시용)
  switchScreen('game-screen');
  document.getElementById('question-text').innerText = '문제 데이터를 생성하고 있습니다...';
  document.getElementById('choices-container').innerHTML = '';

  // 2. 상태 초기화
  gameState.currentIdx = 0;
  gameState.score = 0;
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);

  try {
    const url = `${GAS_BASE_URL}?action=getGameData&sheetName=${encodeURIComponent(currentSheetName)}&count=${currentQCount}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.ok || !json.data || json.data.length === 0) {
      throw new Error("문제 데이터가 없거나 불러오지 못했습니다.");
    }

    gameState.questions = json.data;
    gameState.totalQ = json.data.length;

    // 3. 타이머 시작
    startTimer();
    // 4. 첫 문제 렌더링
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

// ====== [문제 렌더링] 핵심 로직 ======
function renderQuestion() {
  const q = gameState.questions[gameState.currentIdx];
  const qTextEl = document.getElementById('question-text');
  const choicesEl = document.getElementById('choices-container');

  if (!q) return;

  // 문제 텍스트 표시
  qTextEl.innerText = q.question;
  choicesEl.innerHTML = '';

  // 보기 버튼 생성
  q.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerText = choice;
    btn.onclick = () => handleChoiceClick(choice, q.answer);
    choicesEl.appendChild(btn);
  });

  // 수식 렌더링 강제 실행
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
  if (String(selected) === String(correct)) {
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
  clearInterval(gameState.timerInterval);
  const elapsed = (Date.now() - gameState.startTime) / 1000;

  switchScreen('result-screen');
  document.getElementById('result-meta').innerText = `${currentCourse} - ${currentTopic}`;
  document.getElementById('final-score').innerText = `${gameState.score} / ${gameState.totalQ}`;
  document.getElementById('final-time').innerText = `${elapsed.toFixed(2)}초`;
}

// ====== [랭킹 저장] ======
async function onClickSaveScore() {
  const name = getStudentName();
  if (!name) { alert('이름을 입력하세요!'); return; }

  const elapsedText = document.getElementById('final-time').innerText;
  const timeSec = elapsedText.replace('초', '').trim();

  try {
    const url = `${GAS_BASE_URL}?action=saveScore&name=${encodeURIComponent(name)}&topic=${encodeURIComponent(currentSheetName)}&totalQ=${gameState.totalQ}&score=${gameState.score}&timeSec=${timeSec}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.ok) {
      alert('랭킹에 등록되었습니다!');
    }
  } catch (e) {
    alert('저장 실패: ' + e.message);
  }
}

// ====== [이벤트 바인딩] ======
window.addEventListener('load', async () => {
  await initCourseTopicSelect();

  document.getElementById('start-btn').onclick = onClickStartBtn;
  document.getElementById('go-to-quiz-btn').onclick = onStartQuizFromArticle;
  document.getElementById('save-score-btn').onclick = onClickSaveScore;
  document.getElementById('back-home-btn').onclick = () => switchScreen('menu-screen');
  
  // 랭킹 보기 버튼 등 추가 바인딩 필요 시 여기에 작성
});
