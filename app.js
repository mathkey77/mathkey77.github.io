const GAS_URL = "https://script.google.com/macros/s/AKfycbxFj53M2J48tUwM-G0nutcSG673n_0GhTBgOrhR5XlJ6rsVSKvKBR69RQY_5p_Mv3pg/exec"; 

// 앱 시작 시 실행
document.addEventListener('DOMContentLoaded', () => {
    loadCoursesAndTopics();
});

async function loadCoursesAndTopics() {
    const statusDiv = document.getElementById('status-message'); // 로딩 메시지 표시용
    if(statusDiv) statusDiv.innerText = "데이터를 불러오는 중...";

    try {
        // action 파라미터 정확히 전달
        const response = await fetch(`${GAS_URL}?action=getCoursesAndTopics`);
        
        if (!response.ok) throw new Error("Network response was not ok");
        
        const data = await response.json();
        
        // 에러 응답인지 확인
        if (data.error) {
            console.error("Server Error:", data);
            alert("데이터 로딩 실패: " + data.message);
            return;
        }

        console.log("Loaded Data:", data); // 콘솔에서 데이터 확인
        
        // 여기에 드롭다운(Select box) 채우는 로직 실행
        populateCourseSelect(data);
        if(statusDiv) statusDiv.style.display = 'none'; // 로딩 메시지 숨기기

    } catch (error) {
        console.error("Fetch Error:", error);
        if(statusDiv) statusDiv.innerText = "연결 실패. 다시 시도해주세요.";
    }
}

function populateCourseSelect(data) {
    const courseSelect = document.getElementById('course-select');
    const topicSelect = document.getElementById('topic-select');
    
    // 초기화
    courseSelect.innerHTML = '<option value="">과정 선택</option>';
    topicSelect.innerHTML = '<option value="">토픽 선택</option>';

    // 과정 목록 추가
    Object.keys(data).forEach(course => {
        const option = document.createElement('option');
        option.value = course;
        option.textContent = course;
        courseSelect.appendChild(option);
    });

    // 과정 선택 시 토픽 변경 이벤트
    courseSelect.addEventListener('change', () => {
        const selectedCourse = courseSelect.value;
        topicSelect.innerHTML = '<option value="">토픽 선택</option>'; // 토픽 초기화
        
        if (selectedCourse && data[selectedCourse]) {
            data[selectedCourse].forEach(topic => {
                const option = document.createElement('option');
                option.value = topic; // 나중에 API 호출 시 사용될 값
                option.textContent = topic;
                topicSelect.appendChild(option);
            });
        }
    });
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



