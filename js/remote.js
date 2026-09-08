// 효TV 스마트폰 가상 리모컨 스크립트

// 1. 동일 브라우저/탭 간 연동을 위한 BroadcastChannel
const broadcastChannel = new BroadcastChannel('hyotv_remote_channel');

// 2. 서로 다른 기기(휴대폰 <-> PC 모니터) 간 WebRTC P2P연동을 위한 PeerJS
let peer = null;
let peerConnection = null;
let targetPeerId = null;

// URL Query String에서 targetPeerId 파라미터가 있는지 확인 (예: remote.html?target=hyotv-tv-1234)
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
      console.warn('[Remote] PeerJS 연결 경고 (BroadcastChannel로도 연동 가능):', err);
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

  // BroadcastChannel 전송 (동일 PC / 브라우저 창 연동)
  broadcastChannel.postMessage(payload);

  // PeerJS 전송 (실제 휴대폰 <-> 모니터 P2P 연동)
  if (peerConnection && peerConnection.open) {
    peerConnection.send(payload);
  }

  showActionFeedback(actionName);
}

// 화면 상태 및 토스트 피드백
function showActionFeedback(action) {
  let msg = 'TV로 신호 전송!';
  switch (action) {
    case 'MORNING_REPLY': msg = '😊 "잘 잤어" 응답을 TV로 전송했습니다!'; break;
    case 'MED_TAKEN': msg = '💊 "복약 완료" 신호를 TV로 전송했습니다!'; break;
    case 'MED_SNOOZE': msg = '⏰ "복약 연기" 신호를 TV로 전송했습니다!'; break;
    case 'CALL_ACCEPT': msg = '📞 "영상통화 수락" 신호를 전송했습니다!'; break;
    case 'CALL_DECLINE': msg = '❌ "영상통화 거절" 신호를 전송했습니다!'; break;
    case 'CALL_END': msg = '🔴 "영상통화 종료" 신호를 전송했습니다!'; break;
    case 'NAV_OVERVIEW': msg = '📺 TV 화면을 [소개]로 이동했습니다'; break;
    case 'NAV_MORNING': msg = '📺 TV 화면을 [아침인사]로 이동했습니다'; break;
    case 'NAV_MEDICATION': msg = '📺 TV 화면을 [복약알림]으로 이동했습니다'; break;
    case 'NAV_VIDEOCALL': msg = '📺 TV 화면을 [영상통화]로 이동했습니다'; break;
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
// 🎙️ 시니어 음성 인식 (Web Speech API - STT)
// ----------------------------------------------------
let recognition = null;
let isListening = false;

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.warn('[Remote] 이 브라우저는 Web Speech API를 지원하지 않습니다.');
    const hint = document.getElementById('voice-hint-text');
    if (hint) hint.innerText = '⚠️ 음성 인식이 지원되지 않는 브라우저입니다. 버튼을 이용해주세요.';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ko-KR';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    const micBtn = document.getElementById('mic-btn');
    const hint = document.getElementById('voice-hint-text');
    if (micBtn) micBtn.classList.add('listening');
    if (hint) hint.innerHTML = '🔴 <strong>음성을 듣고 있습니다...</strong> ("먹었어", "잘 잤어", "수락")';
  };

  recognition.onend = () => {
    isListening = false;
    const micBtn = document.getElementById('mic-btn');
    const hint = document.getElementById('voice-hint-text');
    if (micBtn) micBtn.classList.remove('listening');
    if (hint) hint.innerHTML = '마이크 버튼을 누르고 <strong>"잘 잤어"</strong>, <strong>"먹었어"</strong>, <strong>"수락"</strong>을 말씀해보세요';
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    console.log('[Remote STT] 인식된 음성:', transcript);
    showRemoteToast(`🎙️ 인식됨: "${transcript}"`);
    handleVoiceCommand(transcript);
  };

  recognition.onerror = (event) => {
    console.error('[Remote STT] 음성 인식 오류:', event.error);
    showRemoteToast('⚠️ 음성을 인식하지 못했습니다. 다시 시도해 주세요.');
  };
}

function toggleVoiceRecognition() {
  if (!recognition) {
    initVoiceRecognition();
  }
  if (!recognition) return;

  if (isListening) {
    recognition.stop();
  } else {
    try {
      recognition.start();
    } catch (e) {
      console.warn('[Remote STT] 이미 동작 중입니다.');
    }
  }
}

// 인식된 음성 텍스트에 따른 명령어 자동 수행
function handleVoiceCommand(text) {
  const lower = text.toLowerCase();

  if (lower.includes('잘 잤') || lower.includes('안녕') || lower.includes('좋은 아침') || lower.includes('응답')) {
    sendAction('MORNING_REPLY');
  } else if (lower.includes('먹었어') || lower.includes('약 먹') || lower.includes('먹었') || lower.includes('네') || lower.includes('예')) {
    sendAction('MED_TAKEN');
  } else if (lower.includes('나중에') || lower.includes('연기') || lower.includes('있다') || lower.includes('이따')) {
    sendAction('MED_SNOOZE');
  } else if (lower.includes('수락') || lower.includes('전화 받') || lower.includes('여보세요') || lower.includes('받아')) {
    sendAction('CALL_ACCEPT');
  } else if (lower.includes('거절') || lower.includes('안 받아') || lower.includes('끊어')) {
    sendAction('CALL_DECLINE');
  } else if (lower.includes('통화 종료') || lower.includes('종료') || lower.includes('끄기') || lower.includes('닫기')) {
    sendAction('CALL_END');
  } else {
    showRemoteToast(`❓ "${text}" 은(는) 등록되지 않은 음성 명령입니다.`);
  }
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  initPeerJS();
  initVoiceRecognition();
});
