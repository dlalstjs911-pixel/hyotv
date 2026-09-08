// 효TV 통합 SPA & 인터랙티브 팝업 모달 핸들러

let callTimerInterval = null;
let callSeconds = 5;
let morningAudioTimeout = null;
let morningSentAutoCloseTimer = null;
let medDoneAutoCloseTimer = null;
let medSnoozeAutoCloseTimer = null;
let medicationTimer = null;
let videoCallTimer = null;
let conversationTimeouts = [];

// --- 아침 인사 안내 창 클릭 이벤트 (자녀 전송 알림 팝업 오픈 & 3초 후 자동 닫힘) ---
function handleMorningDialogClick() {
  const win = document.getElementById('morning-dialog-window');
  if (win) {
    win.classList.add('hide-dialog');
  }

  openModal('modal-morning-sent');
  showToast("아침 인사가 잘 전달 되었습니다. 😊", '💌');

  clearTimeout(morningSentAutoCloseTimer);
  morningSentAutoCloseTimer = setTimeout(() => {
    closeModal('modal-morning-sent');
  }, 3000);
}

function closeMorningDialogOnly() {
  const win = document.getElementById('morning-dialog-window');
  if (win && !win.classList.contains('hide-dialog')) {
    win.classList.add('hide-dialog');
  }
}

// --- 한국어 음성 발화 공통 함수 (딸: 30-40대 중년 여성, 엄마: 70대 여성 어르신 톤) ---
function speakText(text, pitch = 0.95, role = 'daughter') {
  if (!('speechSynthesis' in window)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';

  if (role === 'mother') {
    // 70대 여성 어르신 톤: 다소 천천히(0.82), 인자하고 낮은 목소리(0.72)
    utterance.rate = 0.82;
    utterance.pitch = 0.72;
  } else {
    // 30-40대 중년 딸 톤: 차분하고 안정적(0.90 / 0.95)
    utterance.rate = 0.90;
    utterance.pitch = pitch || 0.95;
  }

  const voices = window.speechSynthesis.getVoices();
  const koreanVoices = voices.filter(v => v.lang.includes('ko') || v.lang.includes('KO'));
  
  if (koreanVoices.length > 0) {
    let selectedVoice = koreanVoices[0];
    if (role === 'mother') {
      // 70대 어르신 여성 보이스: 굵직하고 편안한 보이스 우선 선택
      selectedVoice = koreanVoices.find(v => 
        v.name.toLowerCase().includes('google') ||
        v.name.toLowerCase().includes('korean')
      ) || koreanVoices[koreanVoices.length - 1];
    } else {
      selectedVoice = koreanVoices.find(v => 
        v.name.toLowerCase().includes('yuna') || 
        v.name.toLowerCase().includes('sun-hi') || 
        v.name.toLowerCase().includes('female')
      ) || koreanVoices[0];
    }
    utterance.voice = selectedVoice;
  }

  window.speechSynthesis.speak(utterance);
}

// 복약 알림 멘트 발화 (중년 딸 목소리)
function speakMedicationNotice() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  speakText("엄마 약 먹을 시간이야", 0.95, 'daughter');
}

// --- 복약 알림: 3초 TV 시청 후 팝업 카드 등장 -> 0.5초 후 40대 여성 음성 송출 ---
function triggerMedicationNotice() {
  const popupCard = document.getElementById('medication-popup-card');
  const countdownBadge = document.getElementById('med-countdown-badge');

  if (!popupCard) return;

  popupCard.classList.add('hide-card');
  if (countdownBadge) {
    countdownBadge.innerText = '📺 TV 방송 시청 중... (3초 후 복약 알림 전환)';
    countdownBadge.style.opacity = '1';
  }

  clearTimeout(medicationTimer);
  medicationTimer = setTimeout(() => {
    popupCard.classList.remove('hide-card');
    if (countdownBadge) {
      countdownBadge.style.opacity = '0';
    }
    
    setTimeout(() => {
      speakMedicationNotice();
    }, 500);
  }, 3000);
}

// --- 영상통화 수신: 3초 일일 드라마 시청 후 영상통화 수신 팝업 전환 ---
function triggerVideoCallNotice() {
  const popupCard = document.getElementById('videocall-popup-card');
  const countdownBadge = document.getElementById('videocall-countdown-badge');

  if (!popupCard) return;

  popupCard.classList.add('hide-card');
  if (countdownBadge) {
    countdownBadge.innerText = '📺 일일 드라마 시청 중... (3초 후 영상통화 수신 전환)';
    countdownBadge.style.opacity = '1';
  }

  showToast('📺 SBS 일일 드라마를 시청하고 있습니다. (3초 후 영상통화 전환)', '📺');

  clearTimeout(videoCallTimer);
  videoCallTimer = setTimeout(() => {
    popupCard.classList.remove('hide-card');
    if (countdownBadge) {
      countdownBadge.style.opacity = '0';
    }
    showToast('📞 [영상통화 수신] 딸 지영이에게 걸려온 영상통화입니다!', '📞');
  }, 3000);
}

// --- 한국어 여성 음성 합성 (TTS) 기능: 아침 인사 (중년 딸 목소리) ---
function speakMorningGreeting() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  clearTimeout(morningAudioTimeout);
  morningAudioTimeout = setTimeout(() => {
    speakText("엄마 좋은 아침이에요. 잘 잤어요?", 0.95, 'daughter');
  }, 500);
}

// 브라우저 음성 목록 사전 로딩
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

// --- 팝업 모달 제어 함수 ---
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
  }

  if (modalId === 'modal-morning-sent') {
    clearTimeout(morningSentAutoCloseTimer);
  }
  if (modalId === 'modal-med-done') {
    clearTimeout(medDoneAutoCloseTimer);
  }
  if (modalId === 'modal-med-snooze') {
    clearTimeout(medSnoozeAutoCloseTimer);
  }
  if (modalId === 'modal-videocall-active') {
    clearInterval(callTimerInterval);
    clearConversationSequence();
  }
}

// --- 토스트 알림 메시지 ---
function showToast(message, icon = '💡') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// --- 복약 알림 버튼 기능 ---
function handleMedicationTaken() {
  const popupCard = document.getElementById('medication-popup-card');
  if (popupCard) {
    popupCard.classList.add('hide-card');
  }
  
  openModal('modal-med-done');

  clearTimeout(medDoneAutoCloseTimer);
  medDoneAutoCloseTimer = setTimeout(() => {
    closeModal('modal-med-done');
  }, 3000);
}

function confirmMedicationDone() {
  closeModal('modal-med-done');
}

function handleMedicationSnooze() {
  const popupCard = document.getElementById('medication-popup-card');
  if (popupCard) {
    popupCard.classList.add('hide-card');
  }
  
  openModal('modal-med-snooze');

  clearTimeout(medSnoozeAutoCloseTimer);
  medSnoozeAutoCloseTimer = setTimeout(() => {
    closeModal('modal-med-snooze');
  }, 3000);
}

// --- 영상통화 대화 타임라인 정리 ---
function clearConversationSequence() {
  conversationTimeouts.forEach(t => clearTimeout(t));
  conversationTimeouts = [];
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  
  const motherBubble = document.getElementById('mother-dialog-bubble');
  const daughterBubble = document.getElementById('daughter-dialog-bubble');
  const motherBox = document.getElementById('mother-cam-box');
  const daughterBox = document.getElementById('daughter-cam-box');

  if (motherBubble) motherBubble.classList.remove('active');
  if (daughterBubble) daughterBubble.classList.remove('active');
  if (motherBox) motherBox.classList.remove('speaking');
  if (daughterBox) daughterBox.classList.remove('speaking');
}

// --- 영상통화 수신 [수락] 버튼: 엄마와 딸의 자연스러운 대화 영상 시퀀스 실행 ---
function handleCallAccept() {
  openModal('modal-videocall-active');
  showToast('딸 지영이와 영상통화가 연결되었습니다.', '📞');

  callSeconds = 5;
  const timerElem = document.getElementById('call-timer');
  
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const secs = String(callSeconds % 60).padStart(2, '0');
    if (timerElem) timerElem.innerText = `${mins}:${secs}`;
  }, 1000);

  startMotherDaughterConversation();
}

function startMotherDaughterConversation() {
  clearConversationSequence();

  const motherBubble = document.getElementById('mother-dialog-bubble');
  const daughterBubble = document.getElementById('daughter-dialog-bubble');
  const motherText = document.getElementById('mother-speech-text');
  const daughterText = document.getElementById('daughter-speech-text');
  const motherBox = document.getElementById('mother-cam-box');
  const daughterBox = document.getElementById('daughter-cam-box');

  // [Step 1] 통화 연결 0.8초 후 -> 딸(30-40대 중년 여성 톤): "엄마 뭐하고 계셨어요?"
  const t1 = setTimeout(() => {
    if (daughterBubble && daughterText) {
      daughterText.innerText = "엄마 뭐하고 계셨어요?";
      daughterBubble.classList.add('active');
      if (daughterBox) daughterBox.classList.add('speaking');
    }
    speakText("엄마 뭐하고 계셨어요?", 0.95, 'daughter');
  }, 800);

  // [Step 2] 3.5초 후 -> 딸 말풍선 닫고 -> 엄마(70대 여성 어르신 톤): "드라마 보고 있었어. 저녁은 먹었니?"
  const t2 = setTimeout(() => {
    if (daughterBubble) daughterBubble.classList.remove('active');
    if (daughterBox) daughterBox.classList.remove('speaking');

    if (motherBubble && motherText) {
      motherText.innerText = "드라마 보고 있었어. 저녁은 먹었니?";
      motherBubble.classList.add('active');
      if (motherBox) motherBox.classList.add('speaking');
    }
    speakText("드라마 보고 있었어. 저녁은 먹었니?", 0.72, 'mother');
  }, 3800);

  // [Step 3] 7.5초 후 -> 엄마 말풍선 닫고 -> 딸(30-40대 중년 여성 톤): "네~. 엄마는요?"
  const t3 = setTimeout(() => {
    if (motherBubble) motherBubble.classList.remove('active');
    if (motherBox) motherBox.classList.remove('speaking');

    if (daughterBubble && daughterText) {
      daughterText.innerText = "네~. 엄마는요?";
      daughterBubble.classList.add('active');
      if (daughterBox) daughterBox.classList.add('speaking');
    }
    speakText("네~. 엄마는요?", 0.96, 'daughter');
  }, 7800);

  // [Step 4] 10.5초 후 -> 대화 마무리 말풍선 정리
  const t4 = setTimeout(() => {
    if (daughterBubble) daughterBubble.classList.remove('active');
    if (daughterBox) daughterBox.classList.remove('speaking');
  }, 10800);

  conversationTimeouts.push(t1, t2, t3, t4);
}

function handleCallDecline() {
  const popupCard = document.getElementById('videocall-popup-card');
  if (popupCard) {
    popupCard.classList.add('hide-card');
  }
  showToast('영상통화를 거절하였습니다. 이전 TV 방송으로 돌아갑니다.', '📺');
}

// [통화 종료] 버튼 클릭 시 라이브 통화 창과 수신 카드가 모두 닫히며 일일 드라마 TV 화면으로 바로 복귀!
function endCall() {
  closeModal('modal-videocall-active');
  const popupCard = document.getElementById('videocall-popup-card');
  if (popupCard) {
    popupCard.classList.add('hide-card');
  }
  showToast('영상통화가 종료되었습니다. 일일 드라마 시청 화면으로 돌아갑니다.', '📺');
}

function toggleMic(btn) {
  if (btn.classList.contains('muted')) {
    btn.classList.remove('muted');
    btn.style.background = '';
    showToast('마이크 음소거 해제', '🎙️');
  } else {
    btn.classList.add('muted');
    btn.style.background = '#bb0d16';
    showToast('마이크 음소거 설정', '🔇');
  }
}

// --- SPA 페이지 전환 함수 ---
function switchPage(pageId) {
  const pages = document.querySelectorAll('.tv-page');
  pages.forEach(p => p.classList.remove('active'));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) {
    targetPage.classList.add('active');
  }

  if (pageId === 'morning') {
    const win = document.getElementById('morning-dialog-window');
    if (win) win.classList.remove('hide-dialog');
    speakMorningGreeting();
  } else if (pageId === 'medication') {
    triggerMedicationNotice();
  } else if (pageId === 'videocall') {
    triggerVideoCallNotice();
  } else {
    clearTimeout(medicationTimer);
    clearTimeout(videoCallTimer);
    clearConversationSequence();
  }

  const navItems = document.querySelectorAll('.tv-nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-target') === pageId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  if (window.location.hash !== `#${pageId}`) {
    window.location.hash = pageId;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.tv-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      switchPage(target);
    });
  });

  function handleHashChange() {
    const hash = window.location.hash.replace('#', '');
    if (['overview', 'morning', 'medication', 'videocall'].includes(hash)) {
      switchPage(hash);
    } else {
      switchPage('overview');
    }
  }

  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();

  document.addEventListener('keydown', (e) => {
    const openModals = document.querySelectorAll('.custom-modal-overlay.open');
    if (openModals.length > 0 && e.key === 'Escape') {
      openModals.forEach(m => m.classList.remove('open'));
      clearInterval(callTimerInterval);
      clearTimeout(morningSentAutoCloseTimer);
      clearTimeout(medDoneAutoCloseTimer);
      clearTimeout(medSnoozeAutoCloseTimer);
      clearConversationSequence();
      return;
    }

    switch (e.key) {
      case '1':
        if (window.location.hash === '#morning') {
          handleMorningDialogClick();
        } else {
          switchPage('morning');
        }
        break;
      case '2':
        switchPage('medication');
        break;
      case '3':
        switchPage('videocall');
        break;
      case '0':
      case 'Escape':
        switchPage('overview');
        break;
      default:
        break;
    }
  });

  // ----------------------------------------------------
  // 📱 스마트폰 가상 리모컨 수신기 (BroadcastChannel + PeerJS)
  // ----------------------------------------------------
  initRemoteReceiver();
});

function initRemoteReceiver() {
  // 1. BroadcastChannel 수신 (동일 PC / 브라우저 탭 연동)
  const broadcastChannel = new BroadcastChannel('hyotv_remote_channel');
  broadcastChannel.onmessage = (event) => {
    if (event.data && event.data.action) {
      console.log('[TV Listener] BroadcastChannel 수신 액션:', event.data.action);
      handleRemoteAction(event.data.action);
    }
  };

  // 2. PeerJS 수신 (외부 스마트폰 <-> PC 모니터 P2P 연동)
  try {
    if (typeof Peer !== 'undefined') {
      const peer = new Peer('hyotv-main-screen');
      peer.on('open', (id) => {
        console.log('[TV Listener] TV Peer 준비 완료. ID:', id);
      });
      peer.on('connection', (conn) => {
        console.log('[TV Listener] 스마트폰 리모컨이 연결되었습니다!');
        showToast('📱 스마트폰 리모컨이 연결되었습니다!', '🟢');
        conn.on('data', (data) => {
          if (data && data.action) {
            console.log('[TV Listener] PeerJS 수신 액션:', data.action);
            handleRemoteAction(data.action);
          }
        });
      });
      peer.on('error', (err) => {
        console.warn('[TV Listener] PeerJS 연결 경고 (Local BroadcastChannel 사용):', err);
      });
    }
  } catch (e) {
    console.warn('[TV Listener] PeerJS 로드 실패:', e);
  }
}

// 리모컨 신호에 따른 TV 화면 팝업 제어 및 화면 전환
function handleRemoteAction(action) {
  const activeCallModal = document.getElementById('modal-videocall-active');
  const videoPopupCard = document.getElementById('videocall-popup-card');
  const medPopupCard = document.getElementById('medication-popup-card');
  const morningWindow = document.getElementById('morning-dialog-window');
  const currentHash = window.location.hash.replace('#', '') || 'overview';

  switch (action) {
    // 🟢 초록 버튼: 확인 / 수락 / 먹었어 / 잘 잤어
    case 'BTN_GREEN':
      if (videoPopupCard && !videoPopupCard.classList.contains('hide-card') && currentHash === 'videocall') {
        handleCallAccept();
        showToast('📱 [초록 버튼] 영상통화를 수락했습니다!', '🟢');
      } else if (medPopupCard && !medPopupCard.classList.contains('hide-card') && currentHash === 'medication') {
        handleMedicationTaken();
        showToast('📱 [초록 버튼] 복약 완료 기록되었습니다!', '🟢');
      } else if (morningWindow && !morningWindow.classList.contains('hide-dialog') && currentHash === 'morning') {
        handleMorningDialogClick();
        showToast('📱 [초록 버튼] 아침 인사 "잘 잤어" 응답 완료!', '🟢');
      } else {
        // 현재 위치 페이지에 따라 긍정 액션 실행
        if (currentHash === 'videocall') {
          handleCallAccept();
        } else if (currentHash === 'medication') {
          handleMedicationTaken();
        } else if (currentHash === 'morning') {
          handleMorningDialogClick();
        } else {
          showToast('📱 [초록 버튼] 버튼이 선택되었습니다.', '🟢');
        }
      }
      break;

    // 🔴 빨강 버튼: 거절 / 나중에 / 통화 종료 / 닫기
    case 'BTN_RED':
      // 1. 영상통화 진행 중인 라이브 모달이 열려 있는 경우 -> 통화 종료
      if (activeCallModal && activeCallModal.classList.contains('open')) {
        endCall();
        showToast('📱 [빨강 버튼] 영상통화를 종료했습니다.', '🔴');
      }
      // 2. 영상통화 수신 알림 팝업이 떠 있는 경우 -> 거절
      else if (videoPopupCard && !videoPopupCard.classList.contains('hide-card') && currentHash === 'videocall') {
        handleCallDecline();
        showToast('📱 [빨강 버튼] 영상통화를 거절했습니다.', '🔴');
      }
      // 3. 복약 알림 팝업이 떠 있는 경우 -> 나중에 먹을게
      else if (medPopupCard && !medPopupCard.classList.contains('hide-card') && currentHash === 'medication') {
        handleMedicationSnooze();
        showToast('📱 [빨강 버튼] 복약이 연기되었습니다.', '🔴');
      }
      // 4. 아침 인사 팝업이 떠 있는 경우 -> 닫기
      else if (morningWindow && !morningWindow.classList.contains('hide-dialog') && currentHash === 'morning') {
        closeMorningDialogOnly();
        showToast('📱 [빨강 버튼] 아침 인사가 닫혔습니다.', '🔴');
      }
      // 5. 기본 닫기 / 거절 분기
      else {
        if (currentHash === 'videocall') {
          handleCallDecline();
        } else if (currentHash === 'medication') {
          handleMedicationSnooze();
        } else {
          // 열려 있는 아무 모달이나 닫기
          const openModalElem = document.querySelector('.custom-modal-overlay.open');
          if (openModalElem) {
            openModalElem.classList.remove('open');
            showToast('📱 [빨강 버튼] 팝업 창을 닫았습니다.', '🔴');
          }
        }
      }
      break;

    case 'MORNING_REPLY':
      if (window.location.hash !== '#morning') switchPage('morning');
      handleMorningDialogClick();
      break;

    case 'MED_TAKEN':
      if (window.location.hash !== '#medication') switchPage('medication');
      handleMedicationTaken();
      break;

    case 'MED_SNOOZE':
      if (window.location.hash !== '#medication') switchPage('medication');
      handleMedicationSnooze();
      break;

    case 'CALL_ACCEPT':
      if (window.location.hash !== '#videocall') switchPage('videocall');
      handleCallAccept();
      break;

    case 'CALL_DECLINE':
      if (window.location.hash !== '#videocall') switchPage('videocall');
      handleCallDecline();
      break;

    case 'CALL_END':
      endCall();
      break;

    case 'NAV_OVERVIEW':
      switchPage('overview');
      showToast('📱 [리모컨] 서비스 소개 화면으로 이동', '📺');
      break;

    case 'NAV_MORNING':
      switchPage('morning');
      showToast('📱 [리모컨] 아침 인사 화면으로 이동', '📺');
      break;

    case 'NAV_MEDICATION':
      switchPage('medication');
      showToast('📱 [리모컨] 복약 알림 화면으로 이동', '📺');
      break;

    case 'NAV_VIDEOCALL':
      switchPage('videocall');
      showToast('📱 [리모컨] 영상 통화 화면으로 이동', '📺');
      break;

    default:
      console.warn('[TV Listener] 알 수 없는 액션:', action);
      break;
  }
}

