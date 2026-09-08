// 효TV 스마트폰 가상 리모컨 스크립트 (맥북 마이크 실시간 반응 개선)

// 1. 동일 브라우저/탭 간 연동을 위한 BroadcastChannel
const broadcastChannel = new BroadcastChannel('hyotv_remote_channel');

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
// 🎙️ 맥북/스마트폰 마이크 실시간 감지 (High-Sensitivity STT)
// ----------------------------------------------------
let recognition = null;
let isAutoListening = true;
let lastCommandTime = 0;

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    showRemoteToast('⚠️ 이 브라우저는 마이크 음성 인식을 지원하지 않습니다.');
    return;
  }

  try {
    if (recognition) recognition.stop();
  } catch(e) {}

  recognition = new SpeechRecognition();
  recognition.lang = 'ko-KR';
  recognition.continuous = true;
  recognition.interimResults = true; // 실시간 발화 중간 단어 즉시 수신!

  recognition.onstart = () => {
    console.log('[Remote STT] 마이크 실시간 감지 시작');
    const micBtn = document.getElementById('mic-btn');
    if (micBtn && isAutoListening) {
      micBtn.classList.add('listening');
      micBtn.innerHTML = '<span>🔴 마이크 감지 중...</span>';
    }
  };

  recognition.onend = () => {
    const micBtn = document.getElementById('mic-btn');
    if (!isAutoListening) {
      if (micBtn) {
        micBtn.classList.remove('listening');
        micBtn.innerHTML = '<span>🎙️ 마이크 (일시정지)</span>';
      }
      return;
    }

    // 마이크 끊기면 0.2초 후 즉시 자동 재시작
    setTimeout(() => {
      if (isAutoListening && recognition) {
        try {
          recognition.start();
        } catch (e) {}
      }
    }, 200);
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript.trim();
      console.log('[Remote STT 감지]:', transcript);
      
      if (transcript.length > 0) {
        showRemoteToast(`🎙️ 감지됨: "${transcript}"`);
        
        // 동일 명령어 1초 이내 중복 실행 방지
        const now = Date.now();
        if (now - lastCommandTime > 1200) {
          const matched = handleVoiceCommand(transcript);
          if (matched) {
            lastCommandTime = now;
          }
        }
      }
    }
  };

  recognition.onerror = (event) => {
    console.warn('[Remote STT Error]:', event.error);
    if (event.error === 'not-allowed') {
      showRemoteToast('⚠️ 주소창 왼쪽 자물쇠 아이콘을 눌러 마이크 권한을 [허용]으로 변경해주세요!');
    }
  };

  try {
    recognition.start();
  } catch (e) {}
}

function toggleVoiceRecognition() {
  if (!recognition) {
    initVoiceRecognition();
    return;
  }

  isAutoListening = !isAutoListening;

  const micBtn = document.getElementById('mic-btn');
  if (isAutoListening) {
    showRemoteToast('🎙️ 마이크 감지가 활성화되었습니다!');
    try {
      recognition.start();
    } catch (e) {}
  } else {
    showRemoteToast('⏸️ 마이크 감지가 일시정지되었습니다.');
    if (micBtn) {
      micBtn.classList.remove('listening');
      micBtn.innerHTML = '<span>🎙️ 마이크 (일시정지)</span>';
    }
    try {
      recognition.stop();
    } catch (e) {}
  }
}

// 🟢 초록(O) / 🔴 빨강(X) / 🚨 119 신호 자동 매핑
function handleVoiceCommand(text) {
  const lower = text.toLowerCase();

  // 🚨 119 긴급 명령 (119 / 구조 / 응급 / 도와줘)
  if (
    lower.includes('119') || lower.includes('일일구') || lower.includes('백십구') ||
    lower.includes('구조') || lower.includes('응급') || lower.includes('도와') || lower.includes('살려')
  ) {
    sendAction('BTN_119');
    return true;
  }
  // 🟢 초록 계열 명령 (확인 / 수락 / 먹었어 / 잘 잤어 / 네 / 오 / 긍정)
  else if (
    lower.includes('먹었') || lower.includes('약 먹') || lower.includes('먹었어') ||
    lower.includes('수락') || lower.includes('받아') || lower.includes('여보세요') ||
    lower.includes('잘 잤') || lower.includes('안녕') || lower.includes('좋은 아침') ||
    lower.includes('네') || lower.includes('예') || lower.includes('오')
  ) {
    sendAction('BTN_GREEN');
    return true;
  } 
  // 🔴 빨강 계열 명령 (거절 / 나중에 / 종료 / 아니 / 엑스 / 닫기)
  else if (
    lower.includes('나중에') || lower.includes('이따') || lower.includes('연기') ||
    lower.includes('거절') || lower.includes('안 받') ||
    lower.includes('종료') || lower.includes('통화 종료') || lower.includes('끊어') || lower.includes('닫기') ||
    lower.includes('아니') || lower.includes('엑스')
  ) {
    sendAction('BTN_RED');
    return true;
  }

  return false;
}

window.addEventListener('DOMContentLoaded', () => {
  initPeerJS();
  initVoiceRecognition();
});
