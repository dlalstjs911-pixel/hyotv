// 효TV 스마트폰 가상 리모컨 스크립트 (아이폰 iOS Safari 마이크 세션 호환성 최적화)

// 1. 동일 브라우저/탭 간 연동을 위한 BroadcastChannel
const broadcastChannel = new BroadcastChannel('hyotv_remote_channel');

// TV에서 팝업이 뜨면 자동으로 마이크(말하기 버튼) 켜기!
broadcastChannel.onmessage = (event) => {
  if (event.data && event.data.action === 'POPUP_OPENED') {
    console.log('[Remote] TV 팝업 오픈 신호 수신 -> 마이크 자동 작동!');
    showRemoteToast('🔔 TV 알림 팝업 등장! 음성 인식이 시작됩니다.');
    setTimeout(() => {
      startVoiceRecognitionFresh();
    }, 300);
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
        showRemoteToast('🔔 TV 알림 팝업 등장! 음성 인식이 시작됩니다.');
        setTimeout(() => { startVoiceRecognitionFresh(); }, 300);
      }
    });
  });

  peerConnection.on('close', () => {
    console.log('[Remote] P2P 연결 해제됨');
    updateStatusBadge('Local 브라우저 연동 중', '#eab308');
  });
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
  }, 2200);
}

function updateStatusBadge(text, color) {
  const badge = document.getElementById('connection-status');
  if (badge) {
    badge.innerText = text;
    if (color) badge.style.color = color;
  }
}

// ----------------------------------------------------
// 🎙️ 아이폰 iOS Safari 호환 고감도 신규 세션 음성 인식
// ----------------------------------------------------
let recognition = null;
let isListening = false;

function startVoiceRecognitionFresh() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    showRemoteToast('⚠️ 이 브라우저는 마이크 음성 인식을 지원하지 않습니다.');
    return;
  }

  // 기존 인스턴스 찌꺼기 완벽 정돈
  if (recognition) {
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }

  try {
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      isListening = true;
      console.log('[Remote STT] 마이크 신규 세션 활성화됨');
      const micBtn = document.getElementById('mic-btn');
      if (micBtn) {
        micBtn.classList.add('listening');
        micBtn.innerHTML = '<span>🎙️ 듣는 중...</span>';
      }
    };

    recognition.onend = () => {
      isListening = false;
      console.log('[Remote STT] 마이크 세션 종료');
      const micBtn = document.getElementById('mic-btn');
      if (micBtn) {
        micBtn.classList.remove('listening');
        micBtn.innerHTML = '<span>🎙️ 말하기</span>';
      }
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      console.log('[Remote STT] 인식된 음성:', transcript);
      showRemoteToast(`🎙️ 인식됨: "${transcript}"`);
      handleVoiceCommand(transcript);
    };

    recognition.onerror = (event) => {
      console.warn('[Remote STT 오류]:', event.error);
      isListening = false;
      const micBtn = document.getElementById('mic-btn');
      if (micBtn) {
        micBtn.classList.remove('listening');
        micBtn.innerHTML = '<span>🎙️ 말하기</span>';
      }
      if (event.error === 'not-allowed') {
        showRemoteToast('⚠️ 주소창 왼쪽 aA 버튼을 눌러 마이크 권한을 [허용]으로 설정해주세요!');
      } else if (event.error === 'no-speech') {
        showRemoteToast('⚠️ 음성이 감지되지 않았습니다. 버튼을 다시 누르고 말씀해 주세요.');
      }
    };

    recognition.start();
  } catch (err) {
    console.error('[Remote STT] 시작 예외:', err);
  }
}

function toggleVoiceRecognition() {
  if (isListening && recognition) {
    try { recognition.stop(); } catch (e) {}
    isListening = false;
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
