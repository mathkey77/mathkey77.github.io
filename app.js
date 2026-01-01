// ====== 설정: GAS 웹앱 URL ======
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbxnEwKcaxk9gcfAEiG4rXnxuu7o7EtAOGw0ib0sw2naeQBHCW--jpEKa05ZDj4w1Qu9oQ/exec";

// ====== 전역 상태 ======
let courseTopicMap = {};
let currentCourse = "";
let currentTopic = "";
let currentSheetName = "";
let currentQCount = 10;

const CACHE_DURATION = 60 * 60 * 1000;

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

// ====== 유틸 ======
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}

function getStudentName() {
  return document.getElementById('student-name')?.value.trim() || "";
}

function bindClick(id, fn) {
  const el = document.getElementById(id);
  if (el) el.onclick = fn;
}

// 스마트 수식 변환 함수
function smartFormatMath(text) {
  if (!text) return "";
  return text.replace(/\$\$(.*?)\$\$/g, (match, content) => {
    if (content.trim().length < 8) { 
      return `$${content.trim()}$`;
    }
    return match;
  });
}

function renderMath(element) {
  if (window.renderMathInElement) {
    renderMathInElement(element, {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "$", right: "$", display: false},
        {left: "\\(", right: "\\)", display: false},
        {left: "\\[", right: "\\]", display: true}
      ]
    });
  }
}

// ====== 초기 데이터 로드 ======
async function initCourseTopicSelect() {
  const courseSel = document.getElementById('course-select');
  const topicSel = document.getElementById('topic-select');

  courseSel.innerHTML = '<option>로딩 중...</option>';
  courseSel.disabled = true;
  topicSel.disabled = true;

  try {
    const now = Date.now();
    const cached = localStorage.getItem('math_course_data');
    const cachedTime = localStorage.getItem('math_course_time');

    let data;
    if (cached && cachedTime && now - cachedTime < CACHE_DURATION) {
      data = JSON.parse(cached);
    } else {
      const res = await fetch(`${GAS_BASE_URL}?action=getCoursesAndTopics`);
      const json = await res.json();
      if (!json.ok) throw new Error("서버 응답 오류");
      data = json.data;
      localStorage.setItem('math_course_data', JSON.stringify(data));
      localStorage.setItem('math_course_time', now);
    }

    courseTopicMap = data;
    courseSel.innerHTML = '<option value="">과정 선택</option>';
    Object.keys(data).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.innerText = c;
      courseSel.appendChild(opt);
    });

    courseSel.disabled = false;
    courseSel.onchange = onCourseChange;

  } catch (e) {
    console.error(e);
    alert("과정 데이터를 불러오지 못했습니다.");
  }
}

function onCourseChange() {
  const course = document.getElementById('course-select').value;
  const topicSel = document.getElementById('topic-select');

  topicSel.innerHTML = '<option value="">주제 선택</option>';
  topicSel.disabled = true;

  if (course && courseTopicMap[course]) {
    courseTopicMap[course].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.innerText = t;
      topicSel.appendChild(opt);
    });
    topicSel.disabled = false;
  }
}

// ====== 메뉴 → 개념 ======
async function onClickStartBtn() {
  const name = getStudentName();
  const course = document.getElementById('course-select').value;
  const topic = document.getElementById('topic-select').value;

  if (!name) return alert("이름을 입력해주세요.");
  if (!course || !topic) return alert("과정과 주제를 선택해주세요.");

  const qRadio = document.querySelector('input[name="q-count"]:checked');
  currentQCount = qRadio ? Number(qRadio.value) : 10;

  currentCourse = course;
  currentTopic = topic;
  currentSheetName = `<${course}>${topic}`;

  document.getElementById('article-title').innerText = `${course} - ${topic}`;
  
  const contentEl = document.getElementById('article-content');
  contentEl.innerText = "설명을 불러오는 중...";

  switchScreen('article-screen');

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getDescription&topic=${encodeURIComponent(currentSheetName)}`);
    const json = await res.json();
    
    const rawContent = json.ok && json.data ? json.data : "설명이 없습니다.";
    contentEl.innerHTML = smartFormatMath(rawContent);
    renderMath(contentEl); 
  } catch {
    contentEl.innerText = "설명 로드 실패";
  }
}

async function onStartQuizFromArticle() {
  if (!currentSheetName) {
    alert("주제 정보가 유실되었습니다.");
    switchScreen('menu-screen');
    return;
  }
  await startQuiz();
}

// ====== 퀴즈 시작 ======
async function startQuiz() {
  switchScreen('game-screen');
  const qTextEl = document.getElementById('q-text');
  qTextEl.innerText = "문제를 불러오는 중...";
  document.getElementById('choices').innerHTML = ""; 

  try {
    const url = `${GAS_BASE_URL}?action=getGameData&topic=${encodeURIComponent(currentSheetName)}&count=${currentQCount}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.ok) throw new Error(json.error);

    gameState = {
      questions: json.data,
      currentIdx: 0,
      score: 0,
      startTime: Date.now(),
      totalQ: json.data.length
    };

    startTimer();
    renderQuestion();
  } catch (e) {
    alert("문제를 불러오지 못했습니다.");
    console.error(e);
    switchScreen('menu-screen');
  }
}

// ====== 타이머 ======
function startTimer() {
  clearInterval(gameState.timerInterval);
  gameState.startTime = Date.now();

  gameState.timerInterval = setInterval(() => {
    const diff = (Date.now() - gameState.startTime) / 1000;
    const m = Math.floor(diff / 60);
    const s = Math.floor(diff % 60);
    document.getElementById('stopwatch').innerText =
      `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, 1000);
}

// ====== 문제 렌더링 ======
function renderQuestion() {
  const q = gameState.questions[gameState.currentIdx];
  if (!q) return;

  const progress = ((gameState.currentIdx + 1) / gameState.totalQ) * 100;
  document.getElementById('time-bar').style.width = progress + "%";

  const progressText = document.getElementById('q-progress-text');
  if (progressText) {
    progressText.innerText = `Q. ${gameState.currentIdx + 1} / ${gameState.totalQ}`;
  }
  
  const qTextEl = document.getElementById('q-text');
  qTextEl.innerHTML = smartFormatMath(q.text); 
  renderMath(qTextEl);

  const wrap = document.getElementById('choices');
  wrap.innerHTML = "";

  q.choices.forEach(c => {
    const btn = document.createElement('button');
    btn.innerHTML = smartFormatMath(c); 
    btn.onclick = () => checkAnswer(c);
    wrap.appendChild(btn);
  });
  renderMath(wrap); 
}

function checkAnswer(choice) {
  const q = gameState.questions[gameState.currentIdx];
  if (choice === q.answer) gameState.score++;
  gameState.currentIdx++;
  if (gameState.currentIdx < gameState.totalQ) renderQuestion();
  else endGame();
}

// ====== 종료 및 결과 ======
function endGame() {
  clearInterval(gameState.timerInterval);
  gameState.endTime = Date.now();

  const duration = ((gameState.endTime - gameState.startTime) / 1000).toFixed(2);
  document.getElementById('result-score').innerText = `${gameState.score} / ${gameState.totalQ}`;
  document.getElementById('result-time').innerText = `${duration}초`;

  switchScreen('result-screen');
}

// ====== 점수 저장 (랭킹 등록) ======
async function saveScore() {
  const name = getStudentName();
  const duration = ((gameState.endTime - gameState.startTime) / 1000).toFixed(2);
  
  // 주제 이름 뒤에 문제 수를 붙여서 유니크한 키를 생성
  const rankingKey = `${currentSheetName}_Q${gameState.totalQ}`;

  const btn = document.getElementById('save-score-btn');
  btn.disabled = true;
  btn.innerText = "저장 중...";

  try {
    const url = `${GAS_BASE_URL}?action=saveScore&name=${encodeURIComponent(name)}&topic=${encodeURIComponent(rankingKey)}&totalQ=${gameState.totalQ}&score=${gameState.score}&timeSec=${duration}`;
    const res = await fetch(url);
    const json = await res.json();
    
    if (json.ok) {
      alert(`${gameState.totalQ}문제 모드 랭킹에 등록되었습니다!`);
      showRanking(); 
    }
  } catch (e) {
    console.error(e);
    alert("저장 오류 발생");
  } finally {
    btn.disabled = false;
    btn.innerText = "랭킹 기록하기";
  }
}

// ====== 랭킹 보기 (문제 수별 조회) ======
async function showRanking() {
  switchScreen('ranking-screen');
  const wrap = document.getElementById('ranking-table-wrap');
  wrap.innerHTML = "<div style='text-align:center; padding:20px;'>조회 중...</div>";

  // 현재 푼 문제 수에 맞는 키로 조회 (기본 10문제)
  const targetQCount = gameState.totalQ || currentQCount || 10;
  const rankingKey = `${currentSheetName}_Q${targetQCount}`;

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getRankings&topic=${encodeURIComponent(rankingKey)}`);
    const json = await res.json();
    
    renderRankingTable(json.data, wrap);
    // 상단 제목에 문제 수 표시 추가
    document.getElementById('ranking-meta').innerText = `${currentCourse} > ${currentTopic} (${targetQCount}문제 모드)`;

  } catch {
    wrap.innerHTML = "<div style='text-align:center; color:red;'>로드 실패</div>";
  }
}

// ====== 랭킹 테이블 렌더링 (왕관 적용) ======
function renderRankingTable(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = "<div style='text-align:center; padding:30px; color:#94a3b8;'>해당 모드에 등록된 첫 주인공이 되어보세요!</div>";
    return;
  }

  // 정렬: 점수 높은 순(내림차순) -> 시간 짧은 순(오름차순)
  data.sort((a, b) => {
    const scoreA = Number(a.score);
    const scoreB = Number(b.score);
    const timeA = parseFloat(a.time);
    const timeB = parseFloat(b.time);

    if (scoreA !== scoreB) return scoreB - scoreA;
    return timeA - timeB;
  });

  let html = `
    <table class="ranking-table">
      <thead>
        <tr>
          <th>순위</th>
          <th>이름</th>
          <th>점수</th>
          <th>시간</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach((row, idx) => {
    const rank = idx + 1;
    let rankContent = rank;
    let badgeClass = '';

    // 1, 2, 3등에게만 왕관 배지 스타일 적용
    if (rank === 1) { badgeClass = 'rank-1'; rankContent = '👑'; }
    else if (rank === 2) { badgeClass = 'rank-2'; }
    else if (rank === 3) { badgeClass = 'rank-3'; }

    html += `
      <tr>
        <td><span class="rank-badge ${badgeClass}">${rankContent}</span></td>
        <td><strong style="color:var(--text-main);">${row.name || '익명'}</strong></td>
        <td><span style="color:var(--accent-strong); font-weight:700;">${row.score}점</span></td>
        <td><span style="color:var(--text-muted); font-size:0.85rem;">${row.time}초</span></td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

// ====== 이벤트 바인딩 ======
window.addEventListener('load', () => {
  initCourseTopicSelect();
  bindClick('start-btn', onClickStartBtn);
  bindClick('go-to-quiz-btn', onStartQuizFromArticle);
  
  // 랭킹 보기 버튼
  bindClick('view-ranking-btn', showRanking);
  
  // 결과 화면의 버튼들
  bindClick('save-score-btn', saveScore); // 새로 분리한 함수 연결
  bindClick('back-to-menu-from-result', () => switchScreen('menu-screen'));
  
  // 랭킹 화면의 뒤로가기 버튼들 (ID가 다를 수 있어 둘 다 처리)
  bindClick('back-result-btn', () => switchScreen('result-screen'));
  bindClick('back-home-btn-2', () => switchScreen('menu-screen'));
});
