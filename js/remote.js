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
// 🎙️ 모바일(Safari/Chrome) 친화형 순수 Web Speech API 음성인식 (권한 승인 후 자동 재개 지원)
// ----------------------------------------------------
let recognition = null;
let isListening = false;
let autoResumePending = false;
let retryTimer = null;

function updateMicButtonUI(status) {
  const micBtn = document.getElementById('mic-btn');
  if (!micBtn) return;

  if (status === 'listening') {
    micBtn.classList.add('listening');
    micBtn.innerHTML = '<span>🎙️ 듣는 중...</span>';
  } else if (status === 'preparing') {
    micBtn.classList.add('listening');
    micBtn.innerHTML = '<span>🎙️ 연결 중...</span>';
  } else {
    micBtn.classList.remove('listening');
    micBtn.innerHTML = '<span>🎙️ 말하기</span>';
  }
}

let micSafetyTimer = null;

function startVoiceRecognitionFresh(isAutoRetry = false) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    showRemoteToast('⚠️ 이 브라우저는 마이크 음성 인식을 지원하지 않습니다.');
    alert('⚠️ Safari 또는 Chrome 브라우저를 이용해 주세요.');
    return;
  }

  // 기존 세션 및 타이머 정리
  clearTimeout(micSafetyTimer);
  if (recognition) {
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }

  if (!isAutoRetry) {
    autoResumePending = true;
    updateMicButtonUI('preparing');
  }

  try {
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;      // 0.5초 침묵에도 꺼지지 않도록 true 유지!
    recognition.interimResults = true;   // 실시간 청취 반응
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListening = true;
      autoResumePending = false;
      console.log('[Remote STT] 마이크 활성화 완료 - 6초간 청취 유지');
      updateMicButtonUI('listening');
      showRemoteToast('🎙️ 듣고 있습니다! 편하게 말씀하세요.');

      // 6초간 넉넉하게 마이크를 열어두고, 아무 말도 안 하면 그때 자동 종료
      clearTimeout(micSafetyTimer);
      micSafetyTimer = setTimeout(() => {
        if (isListening && recognition) {
          console.log('[Remote STT] 6초 타임아웃 종료');
          try { recognition.stop(); } catch (e) {}
        }
      }, 6000);
    };

    recognition.onend = () => {
      console.log('[Remote STT] 마이크 세션 종료. autoResumePending:', autoResumePending);
      clearTimeout(micSafetyTimer);
      
      // 권한 팝업을 누르는 사이에 onend가 발생한 경우 자동 재시작!
      if (autoResumePending) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          if (!isListening) {
            console.log('[Remote STT] 팝업 승인 후 음성인식 자동 재개');
            startVoiceRecognitionFresh(true);
          }
        }, 400);
        return;
      }

      isListening = false;
      updateMicButtonUI('idle');
      recognition = null;
    };

    recognition.onresult = (event) => {
      autoResumePending = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim();
        console.log('[Remote STT] 실시간 청취 음성:', transcript);
        showRemoteToast(`🎙️ "${transcript}"`);

        // 음성 명령이 일치하면 즉시 전송 후 마이크 깔끔하게 종료!
        const matched = handleVoiceCommand(transcript);
        if (matched) {
          clearTimeout(micSafetyTimer);
          setTimeout(() => {
            if (recognition) {
              try { recognition.stop(); } catch (e) {}
            }
          }, 300);
          break;
        }
      }
    };

    recognition.onerror = (event) => {
      console.warn('[Remote STT 오류 발생]:', event.error);

      // Safari 권한 팝업 승인 대기 중 abort나 not-allowed일 때
      if (autoResumePending && (event.error === 'not-allowed' || event.error === 'aborted' || event.error === 'audio-capture')) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          if (!isListening) {
            startVoiceRecognitionFresh(true);
          }
        }, 500);
        return;
      }

      // no-speech는 무시하고 계속 듣기 유지
      if (event.error === 'no-speech') {
        console.log('[Remote STT] no-speech 감지 - 계속 듣기 유지 중...');
        return;
      }

      clearTimeout(micSafetyTimer);
      isListening = false;
      autoResumePending = false;
      updateMicButtonUI('idle');

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showRemoteToast('⚠️ 마이크 사용 권한을 [허용]해 주세요!');
      }
      recognition = null;
    };

    recognition.start();
  } catch (err) {
    console.error('[Remote STT] 시작 예외:', err);
    clearTimeout(micSafetyTimer);
    isListening = false;
    autoResumePending = false;
    updateMicButtonUI('idle');
  }
}

function toggleVoiceRecognition() {
  clearTimeout(retryTimer);
  if (isListening && recognition) {
    autoResumePending = false;
    try { recognition.stop(); } catch (e) {}
    isListening = false;
    updateMicButtonUI('idle');
  } else {
    startVoiceRecognitionFresh(false);
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
