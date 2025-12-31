// ====== 설정: GAS 웹앱 URL ======
// 본인의 GAS 배포 URL로 교체되어 있는지 확인하세요.
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbw0Jry0N4CJbvJCEXmnD6wH_hOLxfv1wpMruNuT6jl3HYONPwzvM9nKogwLMt2G_ttviA/exec";

// ====== 전역 변수 ======
let courseTopicMap = {};
let currentCourse = "";
let currentTopic = "";
let currentSheetName = "";
let currentQCount = 10;
const CACHE_DURATION = 60 * 60 * 1000; // 캐시 유효 시간 (1시간)

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

// ====== [공통] 유틸리티 ======
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

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.onclick = handler;
}

// ====== [핵심 기능 1] 초기 데이터 로드 (캐시 적용) ======
async function initCourseTopicSelect() {
  const courseSel = document.getElementById('course-select');
  const topicSel = document.getElementById('topic-select');

  // 로딩 상태 표시
  courseSel.innerHTML = '<option>로딩 중...</option>';
  courseSel.disabled = true;
  topicSel.disabled = true;

  try {
    let data = null;

    // 1. 로컬 스토리지(캐시) 확인
    const saved = localStorage.getItem('math_course_data');
    const savedTime = localStorage.getItem('math_course_time');
    const now = Date.now();

    if (saved && savedTime && (now - parseInt(savedTime) < CACHE_DURATION)) {
      console.log('✅ 로컬 캐시 사용');
      data = JSON.parse(saved);
    } else {
      console.log('📡 서버 데이터 요청 중...');
      const res = await fetch(`${GAS_BASE_URL}?action=getCoursesAndTopics`);
      const json = await res.json();
      
      if (json.ok) {
        data = json.data;
        // 데이터 저장 및 시간 기록
        localStorage.setItem('math_course_data', JSON.stringify(data));
        localStorage.setItem('math_course_time', String(now));
      } else {
        throw new Error("데이터 형식이 올바르지 않습니다.");
      }
    }

    // 2. 데이터가 준비되었으므로 UI 업데이트
    courseTopicMap = data; 
    
    const courses = Object.keys(courseTopicMap);
    courseSel.innerHTML = '<option value="">과정 선택</option>';
    
    courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.innerText = c;
      courseSel.appendChild(opt);
    });

    courseSel.disabled = false;
    courseSel.onchange = onCourseChange; 

  } catch (e) {
    console.error(e);
    courseSel.innerHTML = '<option>로드 실패 (새로고침)</option>';
    alert("데이터를 불러오는 데 실패했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해주세요.");
  }
}

function onCourseChange() {
  const courseSel = document.getElementById('course-select');
  const topicSel = document.getElementById('topic-select');
  
  const selectedCourse = courseSel.value;
  topicSel.innerHTML = '<option value="">주제 선택</option>';
  
  if (selectedCourse && courseTopicMap[selectedCourse]) {
    courseTopicMap[selectedCourse].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.innerText = t;
      topicSel.appendChild(opt);
    });
    topicSel.disabled = false;
  } else {
    topicSel.disabled = true;
  }
}

// ====== [핵심 기능 2] 게임 시작 (Article 화면) ======
function onClickStartBtn() {
  const cVal = document.getElementById('course-select').value;
  const tVal = document.getElementById('topic-select').value;
  const nameVal = getStudentName();

  if (!nameVal) return alert("이름을 입력해주세요.");
  if (!cVal || !tVal) return alert("과정과 주제를 선택해주세요.");

  currentCourse = cVal;
  currentTopic = tVal;
  currentSheetName = `<${cVal}>${tVal}`;

  // Article 화면 준비
  document.getElementById('article-title').innerText = `${cVal} - ${tVal}`;
  document.getElementById('article-content').innerHTML = "설명을 불러오는 중...";

  switchScreen('article-screen');

  // 설명 데이터 로드
  fetch(`${GAS_BASE_URL}?action=getDescription&topic=${encodeURIComponent(currentSheetName)}`)
    .then(res => res.json())
    .then(json => {
      const contentDiv = document.getElementById('article-content');
      if (json.ok && json.data) {
        contentDiv.innerHTML = json.data;
        // 수식 렌더링
        renderMathInElement(contentDiv, {
          delimiters: [
            {left: "$$", right: "$$", display: true},
            {left: "$", right: "$", display: false}
          ]
        });
      } else {
        contentDiv.innerText = "설명 데이터가 없습니다. 바로 문제를 풀어보세요!";
      }
    })
    .catch(err => {
      document.getElementById('article-content').innerText = "설명 로드 실패.";
    });
}

// ====== [핵심 기능 3] 퀴즈 실행 ======
function onStartQuizFromArticle() {
  // 🔥 여기서 다시 확정
  const courseSelect = document.getElementById('course-select');
  const topicSelect = document.getElementById('topic-select');

  const course = courseSelect?.value || currentCourse;
  const topic = topicSelect?.value || currentTopic;

  if (!course || !topic) {
    alert("과정 또는 주제 정보가 없습니다.\n처음 화면으로 돌아갑니다.");
    switchScreen('menu-screen');
    return;
  }

  // ✅ 여기서 최종 확정
  currentCourse = course;
  currentTopic = topic;
  currentSheetName = `<${course}>${topic}`;

  console.log("📌 최종 Sheet Name:", currentSheetName);

  startQuiz(); // ← 여기서 fetch
}

  switchScreen('game-screen');
  document.getElementById('q-text').innerText = "문제를 생성하고 있습니다...";
  const qCount = document.querySelector('input[name="q-count"]:checked').value;
currentQCount = Number(qCount);

  try {
    // 2. 호출 시 encodeURIComponent를 확실히 적용
    const url = `${GAS_BASE_URL}?action=getGameData&topic=${encodeURIComponent(currentSheetName)}&count=${currentQCount}`;
    const res = await fetch(url);
    const json = await res.json();
    
    if (json.ok && json.data) {
      gameState = { 
        questions: json.data, 
        currentIdx: 0, 
        score: 0, 
        startTime: Date.now(), 
        totalQ: json.data.length 
      };
      startTimer();
      renderQuestion();
    } else {
      throw new Error(json.error || "데이터 없음");
    }
  } catch (e) { 
    console.error(e);
    alert("문제를 가져오지 못했습니다: " + e.message); 
    switchScreen('menu-screen'); 
  }
}

function startTimer() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  gameState.startTime = Date.now();
  const sw = document.getElementById('stopwatch');
  
  // 타이머는 UI만 갱신 (시간 흐름 표시)
  gameState.timerInterval = setInterval(() => {
    const diff = (Date.now() - gameState.startTime) / 1000;
    const min = Math.floor(diff / 60);
    const sec = Math.floor(diff % 60);
    if (sw) sw.innerText = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }, 1000);
}

// ====== [핵심 기능 4] 문제 렌더링 (프로그래스 바 적용) ======
// app.js 내의 renderQuestion 함수 일부 수정
function renderQuestion() {
  const q = gameState.questions[gameState.currentIdx];
  if (!q) return; // 데이터가 없으면 중단

  // 프로그래스 바 업데이트
  const progressPercent = ((gameState.currentIdx + 1) / gameState.totalQ) * 100;
  document.getElementById('time-bar').style.width = progressPercent + "%";

  // 문제 텍스트 (서버 데이터 키 확인: q.question 인지 q.text 인지)
  const questionText = q.text || q.question || "문제를 불러올 수 없습니다.";
  document.getElementById('q-text').innerHTML = questionText.replace(/\n/g, '<br>');

  // 보기 버튼 (서버 데이터 키 확인: q.choices 인지 q.options 인지)
  const choices = q.choices || q.options || [];
  const choicesDiv = document.getElementById('choices');
  choicesDiv.innerHTML = '';

  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'nes-btn choice-btn';
    btn.innerHTML = choice; 
    btn.onclick = () => checkAnswer(choice);
    choicesDiv.appendChild(btn);
  });

  // 수식 렌더링 재실행
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(document.getElementById('game-screen'), {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "$", right: "$", display: false}
      ]
    });
  }
}

// ====== [핵심 기능 5] 정답 확인 ======
function checkAnswer(userChoice) {
  const q = gameState.questions[gameState.currentIdx];
  
  // 간단 비교 (공백 제거 후 비교 추천 - 서버사이드에서 이미 isCorrect 플래그를 주기도 하지만 여기선 텍스트 비교)
  // Code.gs에서 정답 체크를 확실히 하려면 여기서 굳이 비교 안하고 다음 로직으로 넘어가도 되지만,
  // 현재 구조상 클라이언트에서 체크한다고 가정.
  // 주의: Code.gs 수정본에서는 isCorrect 로직이 서버에 있으나, 
  // 여기서는 편의상 받아온 데이터에 정답(answer) 필드가 있다고 가정하거나, 
  // 혹은 서버에서 받은 isCorrect를 쓰려면 구조를 바꿔야 함.
  // **기존 로직 유지**: 서버가 {text, isCorrect} 구조의 보기를 준다면 그걸 써야 하는데,
  // 현재 구조는 보기가 단순 텍스트 배열임. 따라서 서버의 정답 텍스트와 비교.
  
  // 공백 제거 정규식
  const normalize = (s) => String(s).replace(/\s+/g, '');
  
  if (normalize(userChoice) === normalize(q.answer)) {
    gameState.score++;
    // alert("정답!"); // 흐름 끊김 방지 위해 생략 가능
  } else {
    // alert(`오답! 정답은: ${q.answer}`);
  }

  gameState.currentIdx++;
  if (gameState.currentIdx < gameState.totalQ) {
    renderQuestion();
  } else {
    endGame();
  }
}

function endGame() {
  clearInterval(gameState.timerInterval);
  gameState.endTime = Date.now();
  
  // 프로그래스 바 100% 채우기
  const timeBar = document.getElementById('time-bar');
  if (timeBar) timeBar.style.width = '100%';

  const duration = ((gameState.endTime - gameState.startTime) / 1000).toFixed(2);
  
  switchScreen('result-screen');
  document.getElementById('result-score').innerText = `${gameState.score} / ${gameState.totalQ}`;
  document.getElementById('result-time').innerText = `${duration}초`;
}

// ====== [핵심 기능 6] 결과 저장 ======
async function onClickSaveScore() {
  const btn = document.getElementById('save-score-btn');
  btn.disabled = true;
  btn.innerText = "저장 중...";

  const duration = ((gameState.endTime - gameState.startTime) / 1000).toFixed(2);
  const payload = {
    action: 'saveScore',
    name: getStudentName(),
    topic: currentSheetName,
    qCount: gameState.totalQ,
    score: gameState.score,
    time: duration
  };

  try {
    // POST 대신 doGet 활용 (CORS 문제 회피용 간단 구현)
    // 실제로는 payload를 쿼리스트링으로 변환
    const qs = new URLSearchParams(payload).toString();
    const res = await fetch(`${GAS_BASE_URL}?${qs}`);
    const json = await res.json();
    
    if (json.ok) {
      alert("기록이 저장되었습니다!");
      showRanking(); // 랭킹 화면으로 이동
    } else {
      alert("저장 실패: " + json.error);
    }
  } catch(e) {
    alert("통신 오류");
  } finally {
    btn.disabled = false;
    btn.innerText = "랭킹에 점수 등록하기";
  }
}

// ====== [핵심 기능 7] 랭킹 조회 (키 불일치 수정됨) ======
async function showRanking() {
  switchScreen('ranking-screen');
  const wrap = document.getElementById('ranking-table-wrap');
  wrap.innerHTML = "랭킹 불러오는 중...";
  
  // 랭킹 메타 정보 표시
  document.getElementById('ranking-meta').innerText = `${currentCourse} > ${currentTopic}`;

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getRankings&topic=${encodeURIComponent(currentSheetName)}`);
    const json = await res.json();
    
    if (json.ok && json.data.length > 0) {
      let html = '<table class="ranking-table"><thead><tr><th>순위</th><th>이름</th><th>점수</th><th>시간</th></tr></thead><tbody>';
      
      json.data.forEach((r, i) => {
        // [수정 포인트] Code.gs에서 보내주는 키값(name, score...)과 일치시킴
        html += `<tr>
          <td>${i+1}</td>
          <td>${r.name}</td>
          <td>${r.score}/${r.qCount}</td>
          <td>${r.time}초</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      wrap.innerHTML = html;
    } else {
      wrap.innerHTML = "<p style='padding:20px;'>아직 등록된 랭킹이 없습니다.<br>1등의 주인공이 되어보세요!</p>";
    }
  } catch (e) {
    wrap.innerHTML = "랭킹 로드 실패";
  }
}

// ====== [보조 기능] 정보 팝업 (Footer용) ======
function showInfoScreen(title, htmlContent) {
  const titleEl = document.getElementById('info-title');
  const contentEl = document.getElementById('info-content');
  
  if(titleEl) titleEl.innerText = title;
  if(contentEl) contentEl.innerHTML = htmlContent;
  
  switchScreen('info-screen');
}


// ====== [실행] 이벤트 바인딩 (여기가 중요) ======
window.addEventListener('load', () => {
  initCourseTopicSelect(); // 앱 시작 시 로딩

  // 버튼 이벤트 연결
  bindClick('start-btn', onClickStartBtn);
  bindClick('go-to-quiz-btn', onStartQuizFromArticle);
  bindClick('save-score-btn', onClickSaveScore);
  bindClick('view-ranking-btn', showRanking);
  bindClick('back-home-btn', () => location.reload());
  bindClick('back-home-btn-2', () => location.reload());
  bindClick('back-result-btn', () => switchScreen('result-screen'));

  // Footer 버튼 기능 연결
  bindClick('btn-service-info', () => {
    showInfoScreen('서비스 소개', `
      <p><strong>Math Physical</strong>은 수학 개념 학습과 연산 피지컬 훈련을 동시에 할 수 있는 서비스입니다.</p>
      <p>구글 시트를 기반으로 작동하며, 누구나 무료로 이용할 수 있습니다.</p>
      <p>제한 시간 없이 나만의 페이스로 문제를 풀고 랭킹에 도전해보세요!</p>
    `);
  });

  bindClick('btn-privacy', () => {
    showInfoScreen('개인정보처리방침', `
      <p>본 서비스는 <strong>닉네임</strong>과 <strong>게임 기록(점수, 시간)</strong> 외의 개인식별정보를 수집하지 않습니다.</p>
      <p>수집된 데이터는 랭킹 산정 목적으로만 사용되며, 언제든지 구글 시트에서 삭제될 수 있습니다.</p>
    `);
  });

  bindClick('btn-contact', () => {
    showInfoScreen('문의하기', `
      <p>오류 제보나 기능 제안은 아래 이메일로 연락주세요.</p>
      <p style="margin-top:10px;">📧 <strong>admin@mathphysical.com</strong></p>
    `);
  });
});







