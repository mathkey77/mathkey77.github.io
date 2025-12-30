// ====== 설정: GAS 웹앱 URL (중복 선언 금지) ======
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbw0Jry0N4CJbvJCEXmnD6wH_hOLxfv1wpMruNuT6jl3HYONPwzvM9nKogwLMt2G_ttviA/exec";

let courseTopicMap = {};

// 현재 선택 상태(랭킹 저장/조회 및 개념 조회에 필요)
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

// ====== [추가] 정적 페이지 데이터 (AdSense 승인 필수 요소) ======
const staticPages = {
  about: {
    title: "서비스 소개",
    content: `
      <h3>Math Physical이란?</h3>
      <p>수학적 사고력과 연산 속도를 동시에 키우기 위한 '수학 피지컬' 측정 서비스입니다.</p>
      <p>단순한 반복 풀이를 넘어, 정확한 개념 이해와 빠른 직관력을 기를 수 있도록 돕습니다.</p>
    `
  },
  contact: {
    title: "문의하기",
    content: `
      <h3>Contact Us</h3>
      <p>서비스 이용 중 불편한 점이나 제안 사항이 있다면 아래로 연락주세요.</p>
      <p><strong>Email:</strong> mathkey77@gmail.com</p>
    `
  },
  privacy: {
    title: "개인정보처리방침",
    content: `
      <h3>개인정보 처리 방침</h3>
      <p>1. 본 서비스는 회원가입 없이 이용 가능하며, 랭킹 등록 시 입력하는 닉네임 외의 개인정보를 수집하지 않습니다.</p>
      <p>2. 구글 애드센스 광고 게재를 위해 제3자 쿠키가 사용될 수 있습니다.</p>
      <p>3. 수집된 기록은 서비스 품질 개선 및 통계 분석 목적으로만 활용됩니다.</p>
    `
  }
};

// ====== 유틸 ======
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}

function getStudentName() {
  const el = document.getElementById('student-name');
  return (el ? el.value : "").trim();
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`Skip bind (missing): #${id}`);
    return;
  }
  el.onclick = handler;
}

// ====== [추가] 정보 화면 열기 함수 (Footer용) ======
function openInfo(pageKey) {
  const data = staticPages[pageKey];
  if (!data) return;
  
  const titleEl = document.getElementById('info-title');
  const contentEl = document.getElementById('info-content');
  
  if (titleEl && contentEl) {
    titleEl.innerText = data.title;
    contentEl.innerHTML = data.content;
    switchScreen('info-screen');
  }
}

// ====== [추가] API 호출: 개념 설명 가져오기 ======
async function fetchDescription(topicKey) {
  const url = `${GAS_BASE_URL}?action=getDescription&topic=${encodeURIComponent(topicKey)}`;
  const res = await fetch(url);
  const json = await res.json();
  return json;
}

// ====== 초기화: 과정/토픽 목록 로드 ======
async function initCourseTopicSelect() {
  const url = `${GAS_BASE_URL}?action=getCoursesAndTopics`;
  const res = await fetch(url);
  const json = await res.json();

  if (!json.ok) throw new Error(json.error || "목록 로드 실패");

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
}

// ====== [수정] 시작 로직: 메뉴 -> 개념 화면으로 이동 ======
async function onClickStartBtn() {
  const name = getStudentName();
  if (!name) { alert('이름을 입력하세요!'); return; }

  const course = document.getElementById('course-select').value;
  const topic = document.getElementById('topic-select').value;
  if (!course || !topic) { alert('과정과 주제를 선택하세요!'); return; }

  // 전역 상태 업데이트
  currentCourse = course;
  currentTopic = topic;
  currentSheetName = `<${course}>${topic}`;
  
  const countRadio = document.querySelector('input[name="q-count"]:checked');
  currentQCount = countRadio ? parseInt(countRadio.value, 10) : 10;

  // 개념 화면(Article Screen) 표시
  switchScreen('article-screen');
  document.getElementById('article-title').innerText = `${course} - ${topic}`;
  const contentBox = document.getElementById('article-content');
  contentBox.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">개념을 불러오는 중...</p>';

  try {
    const res = await fetchDescription(currentSheetName);
    if (res.ok && res.data) {
      contentBox.innerHTML = res.data;
      // 수식 렌더링 (KaTeX)
      if (typeof renderMathInElement === 'function') {
        renderMathInElement(contentBox, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false}
          ],
          throwOnError: false
        });
      }
    } else {
      contentBox.innerHTML = `
        <div style="text-align:center; padding:30px;">
          <p style="font-size:1.2rem;">📝</p>
          <p>아직 개념 설명이 등록되지 않은 주제입니다.<br>바로 문제 풀이를 시작해볼까요?</p>
        </div>`;
    }
  } catch (e) {
    contentBox.innerHTML = `<p style="color:red; text-align:center;">데이터 로드 중 오류가 발생했습니다.</p>`;
  }
}

// ====== [추가] 퀴즈 시작 로직: 개념 화면 -> 게임 화면 ======
async function onStartQuizFromArticle() {
  switchScreen('game-screen');

  // 게임 상태 초기화
  gameState.currentIdx = 0;
  gameState.score = 0;
  document.getElementById('question-text').innerText = '준비 중...';
  document.getElementById('choices-container').innerHTML = '';
  
  const stopwatchEl = document.getElementById('stopwatch');
  if (stopwatchEl) stopwatchEl.innerText = '00:00';

  try {
    const url = `${GAS_BASE_URL}?action=getGameData&sheetName=${encodeURIComponent(currentSheetName)}&count=${currentQCount}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.ok) throw new Error(json.error || '문제 로드 실패');

    gameState.questions = json.data;
    gameState.totalQ = json.data.length;

    startTimer();
    renderQuestion();
  } catch (e) {
    alert('문제를 불러오지 못했습니다: ' + e.message);
    switchScreen('menu-screen');
  }
}

// ====== 게임 플레이: 문제 렌더링 ======
function renderQuestion() {
  const q = gameState.questions[gameState.currentIdx];
  const qTextEl = document.getElementById('question-text');
  qTextEl.innerText = q.question;

  // 수식 렌더링
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(qTextEl, {
      delimiters: [{left:'$', right:'$', display:false}],
      throwOnError: false
    });
  }

  const container = document.getElementById('choices-container');
  container.innerHTML = '';

  q.choices.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerText = c;
    btn.onclick = () => checkAnswer(c, q.answer);
    container.appendChild(btn);
  });
}

// ====== 게임 플레이: 정답 체크 ======
function checkAnswer(selected, correct) {
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

// ====== 타이머 로직 ======
function startTimer() {
  gameState.startTime = Date.now();
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);

  gameState.timerInterval = setInterval(() => {
    const now = Date.now();
    const diff = (now - gameState.startTime) / 1000;
    const min = Math.floor(diff / 60);
    const sec = Math.floor(diff % 60);
    
    const sw = document.getElementById('stopwatch');
    if (sw) {
      sw.innerText = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    const bar = document.getElementById('time-bar');
    if (bar) {
      // 바 애니메이션 등 필요시 로직 추가 가능
    }
  }, 100);
}

// ====== 게임 종료 ======
function endGame() {
  clearInterval(gameState.timerInterval);
  gameState.endTime = Date.now();
  const elapsed = (gameState.endTime - gameState.startTime) / 1000;

  switchScreen('result-screen');
  document.getElementById('result-meta').innerText = `${currentCourse} > ${currentTopic}`;
  document.getElementById('final-score').innerText = `${gameState.score} / ${gameState.totalQ}`;
  document.getElementById('final-time').innerText = `${elapsed.toFixed(2)}초`;
}

// ====== 랭킹 저장 API ======
async function saveScoreToRanking(name, topic, totalQ, score, timeSec) {
  const url = `${GAS_BASE_URL}?action=saveScore&name=${encodeURIComponent(name)}&topic=${encodeURIComponent(topic)}&totalQ=${totalQ}&score=${score}&timeSec=${timeSec}`;
  const res = await fetch(url);
  return await res.json();
}

// ====== 랭킹 조회 API ======
async function fetchRankings(topicKey) {
  const url = `${GAS_BASE_URL}?action=getRankings&topic=${encodeURIComponent(topicKey)}`;
  const res = await fetch(url);
  return await res.json();
}

// ====== 결과: 랭킹 저장 버튼 클릭 ======
async function onClickSaveScore() {
  const name = getStudentName();
  if (!name) { alert('이름을 입력하세요!'); return; }

  const elapsedText = document.getElementById('final-time').innerText;
  const timeSec = elapsedText.replace('초', '').trim();

  try {
    const res = await saveScoreToRanking(name, currentSheetName, currentQCount, gameState.score, timeSec);
    if (res.ok) {
      alert('랭킹에 저장되었습니다!');
      showRankings();
    }
  } catch (e) {
    alert('랭킹 저장 실패: ' + e.message);
  }
}

// ====== 결과: 랭킹 보기 버튼 클릭 ======
async function showRankings() {
  switchScreen('ranking-screen');
  const listWrap = document.getElementById('ranking-table-wrap');
  listWrap.innerHTML = '<div style="padding:20px;">랭킹을 불러오는 중...</div>';
  document.getElementById('ranking-meta').innerText = currentTopic;

  try {
    const res = await fetchRankings(currentSheetName);
    if (res.ok && res.data.length > 0) {
      let html = '<table class="ranking-table"><thead><tr><th>순위</th><th>이름</th><th>점수</th><th>시간</th></tr></thead><tbody>';
      res.data.slice(0, 10).forEach((r, idx) => {
        html += `<tr><td>${idx+1}</td><td>${r.이름}</td><td>${r.점수}/${r.문제수}</td><td>${r.소요시간}s</td></tr>`;
      });
      html += '</tbody></table>';
      listWrap.innerHTML = html;
    } else {
      listWrap.innerHTML = '<div style="padding:20px;">등록된 랭킹이 없습니다.</div>';
    }
  } catch (e) {
    listWrap.innerHTML = '<div style="padding:20px; color:red;">랭킹 로드 실패</div>';
  }
}

// ====== 이벤트 바인딩 ======
window.addEventListener('load', async () => {
  // 1. 초기 데이터 로드 (과정/주제)
  try {
    await initCourseTopicSelect();
  } catch (e) {
    console.error("Init Error:", e);
  }

  // 2. 메인 메뉴 버튼
  bindClick('start-btn', onClickStartBtn);

  // 3. 개념 화면 버튼
  bindClick('go-to-quiz-btn', onStartQuizFromArticle);

  // 4. 결과 화면 버튼
  bindClick('save-score-btn', onClickSaveScore);
  bindClick('view-ranking-btn', showRankings);
  bindClick('back-home-btn', () => switchScreen('menu-screen'));

  // 5. 랭킹 화면 버튼
  bindClick('back-result-btn', () => switchScreen('result-screen'));
  bindClick('back-home-btn-2', () => switchScreen('menu-screen'));
});

