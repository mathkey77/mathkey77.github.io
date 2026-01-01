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

// ✅ [추가] 스마트 수식 변환 함수
// 텍스트 내의 $$수식$$ 패턴을 찾아, 길이가 8자 미만이면 $수식$으로 변경
function smartFormatMath(text) {
  if (!text) return "";
  
  // 정규식: $$ 로 감싸진 구간을 찾습니다.
  return text.replace(/\$\$(.*?)\$\$/g, (match, content) => {
    // 내부 수식 텍스트의 앞뒤 공백을 제거한 길이가 8자 미만일 때
    if (content.trim().length < 8) { 
      // 인라인 수식 기호인 $로 감싸서 반환합니다.
      // 결과 예: $x=3$
      return `$${content.trim()}$`;
    }
    // 8자 이상이면 원래의 $$수식$$ 형태를 유지하여 블록 형태로 렌더링합니다.
    return match;
  });
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
    
    // ✅ 개념 설명에도 스마트 포맷 적용
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

// ====== 문제 렌더링 (수정됨) ======
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
  // ✅ [수정] 문제 텍스트에 스마트 포맷 적용
  qTextEl.innerHTML = smartFormatMath(q.text); 
  renderMath(qTextEl);

  const wrap = document.getElementById('choices');
  wrap.innerHTML = "";

  q.choices.forEach(c => {
    const btn = document.createElement('button');
    // ✅ [수정] 보기 텍스트에도 스마트 포맷 적용
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

// ====== 랭킹 보기 ======
async function showRanking() {
  switchScreen('ranking-screen');
  const wrap = document.getElementById('ranking-table-wrap');
  wrap.innerHTML = "<div style='text-align:center; padding:20px;'>랭킹을 불러오는 중...</div>";

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getRankings&topic=${encodeURIComponent(currentSheetName)}`);
    const json = await res.json();
    
    renderRankingTable(json.data, wrap);
    document.getElementById('ranking-meta').innerText = `${currentCourse} > ${currentTopic}`;

  } catch {
    wrap.innerHTML = "<div style='text-align:center; color:red;'>랭킹 로드 실패</div>";
  }
}

// ✅ [수정] 랭킹 테이블 렌더링 함수
function renderRankingTable(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = "<div style='text-align:center; padding:20px;'>아직 등록된 랭킹이 없습니다.</div>";
    return;
  }

  // 1순위: 점수 내림차순 -> 2순위: 시간 오름차순
  data.sort((a, b) => {
    const scoreA = Number(a.score);
    const scoreB = Number(b.score);
    const timeA = parseFloat(a.time);
    const timeB = parseFloat(b.time);

    if (scoreA !== scoreB) return scoreB - scoreA;
    return timeA - timeB;
  });

  // ✅ 헤더 텍스트 변경: # -> 순위
  let html = `
    <table class="ranking-table" style="width:100%;">
      <thead>
        <tr>
          <th width="20%">순위</th>
          <th width="30%">이름</th>
          <th width="25%">점수</th>
          <th width="25%">시간</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach((row, idx) => {
    const rank = idx + 1;
    let badgeClass = '';
    let rankDisplay = rank;

    // 1, 2, 3등일 때 스타일 적용
    if (rank === 1) badgeClass = 'rank-1';
    else if (rank === 2) badgeClass = 'rank-2';
    else if (rank === 3) badgeClass = 'rank-3';

    html += `
      <tr>
        <td><span class="rank-badge ${badgeClass}">${rankDisplay}</span></td>
        <td>${row.name || '익명'}</td>
        <td style="color:var(--accent-strong); font-weight:bold;">${row.score}</td>
        <td style="color:#64748b; font-size:0.9em;">${row.time}s</td>
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
  bindClick('view-ranking-btn', showRanking);
  bindClick('back-to-menu-from-result', () => switchScreen('menu-screen'));
  bindClick('back-result-btn', () => switchScreen('result-screen'));
  bindClick('back-home-btn-2', () => switchScreen('menu-screen'));

// ✅ 1. 점수 저장 시 문제 수 정보 포함
bindClick('save-score-btn', async () => {
  const name = getStudentName();
  const duration = ((gameState.endTime - gameState.startTime) / 1000).toFixed(2);
  
  // 주제 이름 뒤에 문제 수를 붙여서 유니크한 키를 생성합니다.
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
    alert("저장 오류 발생");
  } finally {
    btn.disabled = false;
    btn.innerText = "랭킹 기록하기";
  }
});

// ✅ 2. 랭킹 조회 시에도 문제 수별로 호출
async function showRanking() {
  switchScreen('ranking-screen');
  const wrap = document.getElementById('ranking-table-wrap');
  wrap.innerHTML = "<div style='text-align:center; padding:20px;'>조회 중...</div>";

  // 현재 푼 문제 수에 맞는 키로 조회
  const rankingKey = `${currentSheetName}_Q${gameState.totalQ}`;

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getRankings&topic=${encodeURIComponent(rankingKey)}`);
    const json = await res.json();
    
    renderRankingTable(json.data, wrap);
    // 상단 제목에 문제 수 표시 추가
    document.getElementById('ranking-meta').innerText = `${currentCourse} > ${currentTopic} (${gameState.totalQ}문제 모드)`;

  } catch {
    wrap.innerHTML = "<div style='text-align:center; color:red;'>로드 실패</div>";
  }
}

// ✅ 3. 왕관 아이콘 및 중앙 정렬 렌더링
function renderRankingTable(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = "<div style='text-align:center; padding:30px; color:#94a3b8;'>해당 모드에 등록된 첫 주인공이 되어보세요!</div>";
    return;
  }

  // 정렬: 점수 높은 순 -> 시간 짧은 순
  data.sort((a, b) => {
    if (Number(b.score) !== Number(a.score)) return Number(b.score) - Number(a.score);
    return parseFloat(a.time) - parseFloat(b.time);
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


