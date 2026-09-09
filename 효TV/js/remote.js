// 효TV 스마트폰 가상 리모컨 스크립트 (아이폰 iOS 하드웨어 마이크 권한 강제 요청 추가)

// 1. 동일 브라우저/탭 간 연동을 위한 BroadcastChannel
const broadcastChannel = new BroadcastChannel('hyotv_remote_channel');

// TV에서 팝업이 뜨면 말하기 버튼 강조 및 알림! (강제 마이크 실행 ➔ Safari 보안 차단 방지)
broadcastChannel.onmessage = (event) => {
  if (event.data && event.data.action === 'POPUP_OPENED') {
    console.log('[Remote] TV 팝업 오픈 신호 수신');
    highlightMicPrompt();
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
        highlightMicPrompt();
      }
    });
  });

  peerConnection.on('close', () => {
    console.log('[Remote] P2P 연결 해제됨');
    updateStatusBadge('Local 브라우저 연동 중', '#eab308');
  });
}

function highlightMicPrompt() {
  showRemoteToast('🔔 TV 알림 도착! 노란색 [말하기]를 누르고 답해보세요.');
  const micBtn = document.getElementById('mic-btn');
  if (micBtn && !isListening) {
    micBtn.classList.add('listening');
    setTimeout(() => {
      if (!isListening) micBtn.classList.remove('listening');
    }, 4000);
  }
}

// 신호 전송 함수
function sendAction(actionName) {
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
let autoRetryCount = 0;

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

function startVoiceRecognitionFresh() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    showRemoteToast('⚠️ 이 브라우저는 음성 인식을 지원하지 않습니다. Safari 또는 Chrome을 이용해 주세요.');
    return;
  }

  // 기존 세션이 있다면 확실하게 종료
  if (recognition) {
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }

  updateMicButtonUI('preparing');

  // iOS Safari 오디오 엔진 안정화를 위해 100ms 지연 후 시작
  setTimeout(() => {
    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'ko-KR';
      recognition.continuous = false;     // iOS Safari 안정 모드
      recognition.interimResults = true;  // 실시간 단어 감지
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isListening = true;
        autoRetryCount = 0;
        console.log('[Remote STT] 마이크 활성화 완료');
        updateMicButtonUI('listening');
        showRemoteToast('🎙️ 마이크 켜짐! "먹었어", "수락" 등을 말씀하세요.');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        transcript = transcript.trim();
        console.log('[Remote STT 실시간 인식]:', transcript);
        showRemoteToast(`🎙️ "${transcript}"`);

        // 음성 명령 분석
        const matched = handleVoiceCommand(transcript);
        if (matched) {
          try { recognition.stop(); } catch (e) {}
          isListening = false;
          updateMicButtonUI('idle');
        }
      };

      recognition.onerror = (event) => {
        console.warn('[Remote STT 에러]:', event.error);
        
        if (event.error === 'not-allowed') {
          showRemoteToast('⚠️ 마이크 권한 필요: Safari 주소창 [가A] ➔ 웹사이트 설정 ➔ 마이크 [허용] 설정');
          updateMicButtonUI('idle');
          isListening = false;
        } else if (event.error === 'no-speech') {
          // 말소리가 안 들려 끊긴 경우, 버튼을 누른 직후라면 1회 자동 재시도
          if (autoRetryCount < 1) {
            autoRetryCount++;
            console.log('[Remote STT] no-speech 재시도...');
            setTimeout(() => {
              if (!isListening) startVoiceRecognitionFresh();
            }, 200);
            return;
          }
          showRemoteToast('⚠️ 목소리가 감지되지 않았습니다. [말하기]를 누르고 크게 말씀해 주세요.');
          updateMicButtonUI('idle');
          isListening = false;
        } else {
          showRemoteToast(`⚠️ 음성 상태: ${event.error}`);
          updateMicButtonUI('idle');
          isListening = false;
        }
      };

      recognition.onend = () => {
        console.log('[Remote STT] 마이크 세션 종료');
        isListening = false;
        updateMicButtonUI('idle');
        recognition = null;
      };

      recognition.start();
    } catch (err) {
      console.error('[Remote STT 시작 예외]:', err);
      showRemoteToast(`⚠️ 마이크 시작 오류: ${err.message || err}`);
      updateMicButtonUI('idle');
      isListening = false;
    }
  }, 120);
}

function toggleVoiceRecognition() {
  if (isListening && recognition) {
    try { recognition.stop(); } catch (e) {}
    isListening = false;
    updateMicButtonUI('idle');
  } else {
    startVoiceRecognitionFresh();
  }
}

// 🟢 초록(O) / 🔴 빨강(X) / 🚨 119 신호 정밀 키워드 매핑
function handleVoiceCommand(text) {
  const lower = text.toLowerCase();

  // 🚨 119 긴급 명령 ("119", "일일구", "백십구", "구조", "응급", "도와줘")
  if (
    lower.includes('119') || lower.includes('일일구') || lower.includes('백십구') ||
    lower.includes('구조') || lower.includes('응급') || lower.includes('도와줘')
  ) {
    sendAction('BTN_119');
    return true;
  }
  // 🔴 빨강 계열 (복약연기: "나중에", "이따가", "아니" / 통화종료: "거절", "통화 종료", "닫기")
  else if (
    lower.includes('나중에') || lower.includes('이따가') || lower.includes('아니') ||
    lower.includes('거절') || lower.includes('통화 종료') || lower.includes('통화종료') || lower.includes('닫기')
  ) {
    sendAction('BTN_RED');
    return true;
  }
  // 🟢 초록 계열 (아침인사: "잘 잤어", "좋은 아침", "안녕" / 복약: "먹었어", "약 먹었어", "네" / 통화: "수락", "여보세요", "받아")
  else if (
    lower.includes('잘 잤어') || lower.includes('좋은 아침') || lower.includes('안녕') ||
    lower.includes('먹었어') || lower.includes('약 먹었어') || lower.includes('먹었다') || lower.includes('네') ||
    lower.includes('수락') || lower.includes('여보세요') || lower.includes('받아')
  ) {
    sendAction('BTN_GREEN');
    return true;
  }

  return false;
}

window.addEventListener('DOMContentLoaded', () => {
  initPeerJS();
});
