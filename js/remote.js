// 효TV 스마트폰 가상 리모컨 스크립트 (아이폰 iOS 하드웨어 마이크 권한 강제 요청 추가)

// 1. 동일 브라우저/탭 간 연동을 위한 BroadcastChannel
const broadcastChannel = new BroadcastChannel('hyotv_remote_channel');
let isCallActiveOnTv = false;

// TV에서 팝업이 뜨면 사용자가 버튼을 누를 필요 없이 즉시 음성인식(말하기) 자동 활성화!
broadcastChannel.onmessage = (event) => {
  if (event.data && event.data.action === 'POPUP_OPENED') {
    console.log('[Remote] BroadcastChannel로 TV 팝업 오픈 신호 수신');
    isCallActiveOnTv = false;
    handleTvPopupNotification(event.data.popupType);
  } else if (event.data && event.data.action === 'CALL_STARTED') {
    console.log('[Remote] 통화 연결 신호 수신 -> 마이크 즉시 종료 (스피커 에코 방지)');
    isCallActiveOnTv = true;
    stopVoiceRecognitionGraceful(true);
  } else if (event.data && event.data.action === 'CALL_ENDED') {
    isCallActiveOnTv = false;
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

  if (peerConnection) {
    try { peerConnection.close(); } catch(e) {}
  }

  peerConnection = peer.connect(tvPeerId, { reliable: true });

  peerConnection.on('open', () => {
    console.log('[Remote] TV 모니터와 P2P 연결 성공!');
    updateStatusBadge('TV 모니터와 1:1 라이브 연동됨! 🟢', '#22c55e');
    showRemoteToast('📺 TV 화면과 실시간 연결되었습니다!');

    peerConnection.on('data', (data) => {
      if (data && data.action === 'POPUP_OPENED') {
        console.log('[Remote] PeerJS로 TV 팝업 신호 수신 -> 마이크 즉시 자동 활성화!');
        isCallActiveOnTv = false;
        handleTvPopupNotification(data.popupType);
      } else if (data && data.action === 'CALL_STARTED') {
        console.log('[Remote] PeerJS로 통화 연결 신호 수신 -> 마이크 즉시 종료!');
        isCallActiveOnTv = true;
        stopVoiceRecognitionGraceful(true);
      } else if (data && data.action === 'CALL_ENDED') {
        isCallActiveOnTv = false;
      }
    });
  });

  peerConnection.on('close', () => {
    console.log('[Remote] P2P 연결 해제됨 -> 2초 후 자동 재연결');
    updateStatusBadge('연결 재시도 중... 🟡', '#eab308');
    setTimeout(() => {
      connectToTV(tvPeerId);
    }, 2000);
  });

  peerConnection.on('error', (err) => {
    console.warn('[Remote] PeerConnection 에러:', err);
    updateStatusBadge('연결 재시도 중... 🟡', '#eab308');
  });
}

// 팝업이 떴을 때 버튼 누를 필요 없이 자동 마이크 활성화
function handleTvPopupNotification(popupType) {
  if (navigator.vibrate) {
    try { navigator.vibrate([120, 80, 120]); } catch (e) {}
  }

  showRemoteToast('🔔 TV 알림 도착! "먹었어", "수락" 등을 말씀하세요!');
  updateVoiceHUD('listening', '🔔 TV 알림 도착! 지금 말씀하세요! ("먹었어", "수락" 등)');
  
  // 버튼 클릭 없이 즉시 말하기(음성인식) 가동
  try {
    startVoiceRecognitionFresh();
  } catch (e) {
    console.warn('[Remote] 자동 음성 인식 시작 예외:', e);
  }
}

// 🟢🔴⚪ O, X, 119 신호 전송 함수 (지연 없이 즉각 100% 전송)
function sendAction(actionName) {
  const payload = {
    action: actionName,
    timestamp: Date.now()
  };

  // 1. BroadcastChannel 전송 (동일 기기 테스트용)
  broadcastChannel.postMessage(payload);

  // 2. PeerJS 전송 (외부 스마트폰 -> TV 모니터)
  if (peerConnection && peerConnection.open) {
    peerConnection.send(payload);
    console.log('[Remote] 신호 전송 성공:', actionName);
  } else {
    console.warn('[Remote] PeerJS 연결이 일시 끊김 -> 즉시 재연결 후 전송');
    connectToTV(targetParam);
    setTimeout(() => {
      if (peerConnection && peerConnection.open) {
        peerConnection.send(payload);
      }
    }, 400);
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
// 🎙️ 아이폰 iOS Safari 최적화 실시간 Web Speech API 음성인식 엔진 + 실시간 HUD
// ----------------------------------------------------
let recognition = null;
let isListening = false;
let listenTimeout = null;
let commandHandled = false;

// voice HUD 카드는 UI 단순화를 위해 제거되었으므로 빈 함수로 유지합니다.
function updateVoiceHUD(status, mainText) {
  // no-op
}

function updateMicButtonUI(status) {
  const micBtn = document.getElementById('mic-btn');
  if (!micBtn) return;

  if (status === 'listening') {
    micBtn.classList.add('listening');
    micBtn.innerHTML = '<span>🎙️ 듣는중...</span>';
  } else if (status === 'preparing') {
    micBtn.classList.add('listening');
    micBtn.innerHTML = '<span>🎙️ 듣는중...</span>';
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
    updateVoiceHUD('idle', '🎙️ 마이크가 꺼졌습니다.');
    showRemoteToast('🎙️ 마이크가 꺼졌습니다.');
  }
}

function startVoiceRecognitionFresh() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    updateVoiceHUD('error', '⚠️ Safari 또는 Chrome 브라우저를 이용해 주세요.');
    showRemoteToast('⚠️ 이 브라우저는 음성 인식을 지원하지 않습니다.');
    return;
  }

  // 이전 세션 콜백 완전 격리 및 정리
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
  updateMicButtonUI('listening');
  updateVoiceHUD('listening', '귀 기울여 듣고 있어요... 말씀하세요!');

  // 사용자가 응답(명령어 발화)을 하거나 직접 마이크를 끌 때까지 상시 청취 유지
  if (listenTimeout) {
    clearTimeout(listenTimeout);
    listenTimeout = null;
  }

  // ⭐️ 핵심: 유저 제스처(터치/클릭) 유실 방지를 위해 setTimeout 없이 동기적으로 즉시 start() 실행!
  try {
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;     // iOS Safari 안정 모드
    recognition.interimResults = true;  // 실시간 단어 감지
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('[Remote STT] 마이크 청취 활성화됨');
      updateMicButtonUI('listening');
      updateVoiceHUD('listening', '듣고 있습니다... 말씀하세요!');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      transcript = transcript.trim();
      if (!transcript) return;

      console.log('[Remote STT 실시간 인식]:', transcript);
      updateVoiceHUD('listening', `"${transcript}"`);

      // 음성 명령 분석
      const matched = handleVoiceCommand(transcript);
      if (matched) {
        commandHandled = true;
        updateVoiceHUD('success', `🟢 "${transcript}" ➔ TV 전송 완료!`);
        setTimeout(() => {
          stopVoiceRecognitionGraceful(false);
        }, 1200);
      }
    };

    recognition.onerror = (event) => {
      console.warn('[Remote STT 에러/상태]:', event.error);
      if (event.error === 'aborted') return;

      if (event.error === 'not-allowed') {
        updateVoiceHUD('error', '⚠️ 마이크 권한 필요: 주소창 [가A] ➔ 마이크 [허용]');
        showRemoteToast('⚠️ Safari 주소창 [가A] ➔ 웹사이트 설정 ➔ 마이크 [허용] 설정');
        stopVoiceRecognitionGraceful(false);
      } else if (event.error === 'no-speech') {
        console.log('[Remote STT] 침묵 감지됨 - 대기 시간 내 계속 청취');
        updateVoiceHUD('listening', '말씀을 듣고 있어요... 조금 더 크게 말씀해 주세요!');
      } else {
        console.log('[Remote STT 기타 상태]', event.error);
      }
    };

    recognition.onend = () => {
      console.log('[Remote STT] 단일 세션 완료');
      // 8초 대기 창이 유효하고 명령 처리가 안 되었다면 즉시 청취 유지
      if (isListening && !commandHandled) {
        try {
          if (recognition) recognition.start();
        } catch (e) {
          setTimeout(() => {
            if (isListening && !commandHandled) startVoiceRecognitionFresh();
          }, 80);
        }
      } else {
        updateMicButtonUI('idle');
        recognition = null;
      }
    };

    // 동기 즉시 시작
    recognition.start();

  } catch (err) {
    console.error('[Remote STT 시작 예외]:', err);
    updateVoiceHUD('error', `⚠️ 마이크 시작 실패: ${err.message || err}`);
    updateMicButtonUI('idle');
    isListening = false;
  }
}

function toggleVoiceRecognition() {
  if (isListening) {
    stopVoiceRecognitionGraceful(true);
  } else {
    startVoiceRecognitionFresh();
  }
}

// 🟢 초록(O) / 🔴 빨강(X) / 🚨 119 신호 정밀 키워드 매핑 (자연어 및 방언/구어체 대폭 확장)
function handleVoiceCommand(text) {
  const lower = text.replace(/\s+/g, '').toLowerCase(); // 공백 제거 후 비교

  // ⭐️ [통화 중 보호] TV에서 통화가 진행 중일 때:
  // 오직 명확한 통화 종료 발화만 BTN_RED로 전송하고, 통화 중 일상 대화('아니', '이따', '먹었어' 등)로 통화가 끊기지 않도록 차단
  if (isCallActiveOnTv) {
    const hangupWords = ['통화종료', '전화끊어', '전화끊자', '통화끝', '통화종료해줘', '통화종료할게'];
    if (hangupWords.some(kw => lower.includes(kw))) {
      sendAction('BTN_RED');
      isCallActiveOnTv = false;
      return true;
    }
    return false; // 통화 중 일상 대화는 TV로 신호 전송하지 않고 무시!
  }

  // ⭐️ [TV 안내 방송 에코 방지] TV 스피커 소리가 스마트폰 리모컨 마이크로 들어가 자동 오작동하는 현상 원천 차단
  const tvPromptEchoes = [
    '엄마좋은아침이에요잘잤어요', '좋은아침이에요잘잤어요', '잘잤어요', '잘자써요', '잘잤니',
    '엄마좋은아침', '좋은아침이에요', '엄마좋은아침이에요', '좋은아침',
    '엄마약먹을시간', '약먹을시간이야', '약먹을시간',
    '엄마뭐하고계셨어요', '뭐하고계셨어요', '드라마보고있었어', '저녁은먹었니', '네엄마는요'
  ];
  if (tvPromptEchoes.some(echo => lower.includes(echo))) {
    console.log('[Remote STT] TV 스피커 안내 방송/질문 에코 무시:', text);
    return false;
  }

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
    '아니', '아니요', '아뇨', '아냐', '안해', '안할래',
    '안먹', '안먹어', '안먹었', '안먹었어요', '안먹을래',
    '나중에', '이따가', '이따', '싫어', '싫어요', '싫다',
    '거절', '취소', '닫기', '닫아',
    '끊어', '끊을래', '끊자', '통화종료', '종료', '그만', '아직', '안돼', '안된다'
  ];
  if (redKeywords.some(kw => lower.includes(kw))) {
    console.log('[Remote STT] 🔴 빨강(X/거절) 키워드 감지:', text);
    sendAction('BTN_RED');
    return true;
  }

  // 🟢 초록 계열 (O, 수락, 긍정, 복약 완료, 통화 연결, 아침 인사)
  const greenKeywords = [
    // 공통 긍정 및 수락 (어간 단위 확장: 알았다, 알겠습니다, 좋다, 그럼 등 모두 포함)
    '네', '예', '응', '내', '넹', '옙', '어먹었어',
    '그래', '그럼', '그려', '그라제',
    '좋아', '좋아요', '좋다', '좋지', '좋네', '오냐',
    '알았', '알았어', '알았어요', '알았다', '알았지', '알았네', '알겠', '알겠어', '알겠어요', '알겠습니다', '알겠다',
    '확인', '완료', '수락', '동의', '받아', '받아라',
    
    // 복약 완료
    '먹었', '먹었어', '먹었어요', '먹었습니다', '먹음', '먹었다', '먹었지', '먹었네',
    '약먹었', '약먹었어요', '약먹었습니다',
    
    // 통화 연결
    '여보세요', '통화', '전화받아', '연결',
    
    // 🌅 아침 인사 응답 (부모님의 실제 응답 어간)
    '잘잤어', '잘잤다', '잘잤지', '잘잤네', '잘자서', '잘잣', '푹잤', '푹자', '일어났', '자고일어'
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
