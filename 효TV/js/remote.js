// 효TV 스마트폰 가상 리모컨 스크립트 (아이폰 iOS 하드웨어 마이크 권한 강제 요청 추가)

// 1. 동일 브라우저/탭 간 연동을 위한 BroadcastChannel
const broadcastChannel = new BroadcastChannel('hyotv_remote_channel');

// TV에서 팝업이 뜨면 사용자가 버튼을 누를 필요 없이 즉시 음성인식(말하기) 자동 활성화!
broadcastChannel.onmessage = (event) => {
  if (event.data && event.data.action === 'POPUP_OPENED') {
    console.log('[Remote] BroadcastChannel로 TV 팝업 오픈 신호 수신');
    handleTvPopupNotification(event.data.popupType);
  }
};

// 2. 서로 다른 기기(휴대폰 <-> PC 모니터) 간 WebRTC P2P연동을 위한 PeerJS
let peer = null;
let peerConnection = null;
let targetPeerId = null;

const urlParams = new URLSearchParams(window.location.search);
const targetParam = urlParams.get('target') || 'hyotv-main-screen';

function initPeerJS() {
  try {
    peer = new Peer();
    
    peer.on('open', (id) => {
      console.log('[Remote] 내 Peer ID:', id);
      connectToTV(targetParam);
    });

    peer.on('error', (err) => {
      console.warn('[Remote] PeerJS 연결 경고 (BroadcastChannel 사용 가능):', err);
      updateStatusBadge('TV 화면 연동됨 (Local)', '#22c55e');
    });
  } catch (e) {
    console.warn('[Remote] PeerJS 로드 실패 (BroadcastChannel 사용):', e);
  }
}

function connectToTV(tvPeerId) {
  if (!peer) return;
  targetPeerId = tvPeerId;
  peerConnection = peer.connect(tvPeerId);

  peerConnection.on('open', () => {
    console.log('[Remote] TV 모니터와 P2P 연결 성공!');
    updateStatusBadge('TV 모니터와 1:1 라이브 연동됨! 🟢', '#22c55e');
    showRemoteToast('📺 TV 화면과 실시간 연결되었습니다!');

    peerConnection.on('data', (data) => {
      if (data && data.action === 'POPUP_OPENED') {
        console.log('[Remote] PeerJS로 TV 팝업 신호 수신 -> 마이크 즉시 자동 활성화!');
        handleTvPopupNotification(data.popupType);
      }
    });
  });

  peerConnection.on('close', () => {
    console.log('[Remote] P2P 연결 해제됨');
    updateStatusBadge('Local 브라우저 연동 중', '#eab308');
  });
}

// 팝업이 떴을 때 버튼 누를 필요 없이 자동 마이크 활성화
function handleTvPopupNotification(popupType) {
  if (navigator.vibrate) {
    try { navigator.vibrate([120, 80, 120]); } catch (e) {}
  }

  showRemoteToast('🔔 TV 알림 도착! 자동으로 마이크가 켜졌습니다. 말씀하세요!');
  
  // 버튼 클릭 없이 즉시 말하기(음성인식) 가동
  startVoiceRecognitionFresh();
}

// 신호 전송 함수 (팝업 관통 터치 방어막 탑재)
let lastActionTime = 0;

function sendAction(actionName) {
  const now = Date.now();
  // 마이크 팝업 허용을 누를 때 뒤에 있는 버튼이 잘못 눌리는 관통 터치 방어
  if (now - lastToggleTime < 800) {
    console.log('[Remote] 마이크 활성화 직후 관통 터치 방어됨:', actionName);
    return;
  }

  const payload = {
    action: actionName,
    timestamp: Date.now()
  };

  // BroadcastChannel 전송
  broadcastChannel.postMessage(payload);

  // PeerJS 전송
  if (peerConnection && peerConnection.open) {
    peerConnection.send(payload);
  }

  showActionFeedback(actionName);
}

// 화면 상태 및 토스트 피드백
function showActionFeedback(action) {
  let msg = 'TV로 신호 전송!';
  switch (action) {
    case 'BTN_GREEN': msg = '🟢 [O] 확인/먹었어/수락 신호 전송!'; break;
    case 'BTN_RED': msg = '🔴 [X] 거절/나중에/통화종료 신호 전송!'; break;
    case 'BTN_119': msg = '🚨 119 긴급 구조 요청을 TV로 전송했습니다!'; break;
  }
  showRemoteToast(msg);
}

function showRemoteToast(message) {
  const toast = document.getElementById('remote-toast');
  if (!toast) return;

  toast.innerText = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function updateStatusBadge(text, color) {
  const badge = document.getElementById('connection-status');
  if (badge) {
    badge.innerText = text;
    if (color) badge.style.color = color;
  }
}

// ----------------------------------------------------
// 🎙️ 아이폰 iOS Safari 최적화 실시간 Web Speech API 음성인식 엔진
// ----------------------------------------------------
let recognition = null;
let isListening = false;
let listenTimeout = null;
let commandHandled = false;

function updateMicButtonUI(status) {
  const micBtn = document.getElementById('mic-btn');
  if (!micBtn) return;

  if (status === 'listening') {
    micBtn.classList.add('listening');
    micBtn.innerHTML = '<span>🎙️ 듣는 중... 말씀하세요!</span>';
  } else if (status === 'preparing') {
    micBtn.classList.add('listening');
    micBtn.innerHTML = '<span>🎙️ 마이크 준비 중...</span>';
  } else {
    micBtn.classList.remove('listening');
    micBtn.innerHTML = '<span>🎙️ 말하기</span>';
  }
}

function stopVoiceRecognitionGraceful(userInitiated = true) {
  if (listenTimeout) {
    clearTimeout(listenTimeout);
    listenTimeout = null;
  }
  isListening = false;
  commandHandled = false;

  if (recognition) {
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }

  updateMicButtonUI('idle');
  if (userInitiated) {
    showRemoteToast('🎙️ 마이크가 꺼졌습니다.');
  }
}

function startVoiceRecognitionFresh() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    showRemoteToast('⚠️ 이 브라우저는 음성 인식을 지원하지 않습니다. Safari 또는 Chrome을 이용해 주세요.');
    return;
  }

  // 이전 세션 콜백 격리 및 정리
  if (recognition) {
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }

  isListening = true;
  commandHandled = false;
  updateMicButtonUI('preparing');

  // 7초 동안 충분히 말씀하실 수 있도록 대기 시간 부여
  if (listenTimeout) clearTimeout(listenTimeout);
  listenTimeout = setTimeout(() => {
    if (isListening && !commandHandled) {
      console.log('[Remote STT] 7초 청취 대기 시간 만료');
      stopVoiceRecognitionGraceful(false);
      showRemoteToast('⌛ 대기 시간이 지나 마이크가 꺼졌습니다. 다시 누르고 말씀하세요.');
    }
  }, 7000);

  function launchSession() {
    if (!isListening || commandHandled) return;

    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'ko-KR';
      recognition.continuous = false;     // iOS Safari 안정 모드
      recognition.interimResults = true;  // 실시간 단어 감지
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (!isListening) return;
        console.log('[Remote STT] 마이크 청취 활성화');
        updateMicButtonUI('listening');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        transcript = transcript.trim();
        if (!transcript) return;

        console.log('[Remote STT 실시간 인식]:', transcript);
        showRemoteToast(`🎙️ "${transcript}"`);

        // 음성 명령 분석
        const matched = handleVoiceCommand(transcript);
        if (matched) {
          commandHandled = true;
          stopVoiceRecognitionGraceful(false);
        }
      };

      recognition.onerror = (event) => {
        console.warn('[Remote STT 상태/에러]:', event.error);
        
        // aborted는 전환 신호이므로 에러 처리 생략
        if (event.error === 'aborted') return;

        if (event.error === 'not-allowed') {
          showRemoteToast('⚠️ 마이크 권한 필요: Safari 주소창 [가A] ➔ 웹사이트 설정 ➔ 마이크 [허용] 설정');
          stopVoiceRecognitionGraceful(false);
        } else if (event.error === 'no-speech') {
          // 침묵으로 끊긴 경우, 7초 창이 살아있다면 조용히 재연결 유지
          console.log('[Remote STT] 침묵 감지됨 - 7초 창 내에서 계속 청취 대기');
        } else {
          // 기타 에러 시에도 치명적이지 않은 경우 유지 시도
          console.log('[Remote STT 비치명 에러]', event.error);
        }
      };

      recognition.onend = () => {
        console.log('[Remote STT] 단일 세션 완료, 유지 여부 체크...');
        // 7초 창이 아직 유효하고 명령이 처리되지 않았다면 즉시 재시작하여 2~3초 만에 꺼지는 것 방지!
        if (isListening && !commandHandled) {
          setTimeout(() => {
            if (isListening && !commandHandled) {
              launchSession();
            }
          }, 80);
        } else {
          updateMicButtonUI('idle');
          recognition = null;
        }
      };

      recognition.start();
    } catch (err) {
      console.error('[Remote STT 시작 예외]:', err);
      // 예외 발생 시 잠시 후 1회 재시도
      setTimeout(() => {
        if (isListening && !commandHandled) launchSession();
      }, 150);
    }
  }

  // 100ms 후 첫 세션 시작
  setTimeout(launchSession, 100);
  showRemoteToast('🎙️ 마이크 켜짐! "먹었어", "수락", "거절" 등을 말씀하세요.');
}

let lastToggleTime = 0;

function toggleVoiceRecognition() {
  const now = Date.now();
  // 팝업 관통 및 연타 터치 방어막 (1초)
  if (now - lastToggleTime < 1000) {
    console.log('[Remote STT] 관통/중복 터치 방어');
    return;
  }
  lastToggleTime = now;

  if (isListening) {
    stopVoiceRecognitionGraceful(true);
  } else {
    startVoiceRecognitionFresh();
  }
}

// 🟢 초록(O) / 🔴 빨강(X) / 🚨 119 신호 정밀 키워드 매핑 (자연어 및 방언/구어체 대폭 확장)
function handleVoiceCommand(text) {
  const lower = text.replace(/\s+/g, '').toLowerCase(); // 공백 제거 후 비교

  // 🚨 119 긴급 명령
  const urgentKeywords = [
    '119', '일일구', '백십구', '구조', '응급', '도와줘', '도와줘요', '살려줘',
    '살려주세요', '구급차', '병원', '아파', '아파요', '숨차', '숨이차'
  ];
  if (urgentKeywords.some(kw => lower.includes(kw))) {
    console.log('[Remote STT] 🚨 119 긴급 키워드 감지:', text);
    sendAction('BTN_119');
    return true;
  }

  // 🔴 빨강 계열 (X, 거절, 취소, 연기, 통화 종료)
  const redKeywords = [
    '아니', '아니요', '아뇨', '아냐', '안먹', '안먹어', '안먹었', '안먹었어요', '안먹을래',
    '나중에', '이따가', '이따', '싫어', '싫어요', '거절', '취소', '닫기', '닫아',
    '끊어', '끊을래', '끊자', '통화종료', '종료', '그만', '아직'
  ];
  if (redKeywords.some(kw => lower.includes(kw))) {
    console.log('[Remote STT] 🔴 빨강(X/거절) 키워드 감지:', text);
    sendAction('BTN_RED');
    return true;
  }

  // 🟢 초록 계열 (O, 수락, 긍정, 복약 완료, 통화 연결, 아침 인사)
  const greenKeywords = [
    '먹었', '먹었어', '먹었어요', '먹었습니다', '먹음', '먹었다', '먹었지', '먹었네',
    '약먹었', '약먹었어요', '약먹었습니다', '네', '예', '응', '어', '어먹었어', '그래',
    '알았어', '알았어요', '알겠어', '알겠어요', '확인', '완료', '수락', '받아', '받아라',
    '여보세요', '통화', '전화받아', '연결', '좋아', '좋아요', '오냐', '잘잤어', '좋은아침', '안녕'
  ];
  if (greenKeywords.some(kw => lower.includes(kw))) {
    console.log('[Remote STT] 🟢 초록(O/수락) 키워드 감지:', text);
    sendAction('BTN_GREEN');
    return true;
  }

  return false;
}

// 모바일 브라우저 오디오 세션 언락 (첫 화면 터치 시 자동 활성화)
function setupMobileAudioUnlock() {
  const unlock = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        ctx.resume().then(() => ctx.close());
      }
    } catch (e) {}
    document.removeEventListener('touchstart', unlock);
    document.removeEventListener('click', unlock);
  };
  document.addEventListener('touchstart', unlock, { once: true, passive: true });
  document.addEventListener('click', unlock, { once: true });
}

window.addEventListener('DOMContentLoaded', () => {
  initPeerJS();
  setupMobileAudioUnlock();
});
