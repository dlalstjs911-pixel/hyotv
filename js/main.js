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

let isTtsSpeaking = false;
let lastTtsEndTime = 0;

// --- 한국어 음성 발화 공통 함수 (딸: 30-40대 중년 여성, 엄마: 70대 여성 어르신 톤) ---
function speakText(text, pitch = 0.95, role = 'daughter', onStart = null, onEnd = null) {
  if (!('speechSynthesis' in window)) {
    if (onStart) onStart();
    setTimeout(() => { if (onEnd) onEnd(); }, 2000);
    return;
  }

  // 큐에 밀려있던 이전 잔여 발화 즉시 초기화
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';

  // TV TTS 발화 중 자체 마이크 오인식 방지 플래그
  utterance.onstart = () => {
    isTtsSpeaking = true;
    console.log('[TV TTS] 실제 음성 송출 시작:', text);
    if (onStart) onStart();
  };
  utterance.onend = () => {
    isTtsSpeaking = false;
    lastTtsEndTime = Date.now();
    console.log('[TV TTS] 음성 송출 완료:', text);
    if (onEnd) onEnd();
  };
  utterance.onerror = (err) => {
    isTtsSpeaking = false;
    lastTtsEndTime = Date.now();
    console.warn('[TV TTS] 발화 오류 또는 취소:', err);
    if (onEnd) onEnd();
  };

  if (role === 'mother') {
    // 70대 여성 어르신 톤: 다소 천천히(0.82), 인자하고 낮은 목소리(0.72)
    utterance.rate = 0.82;
    utterance.pitch = 0.72;
  } else {
    // 30-40대 중년 딸 톤: 최초의 정확했던 설정 완벽 복원 (rate: 0.90, pitch: 0.95)
    utterance.rate = 0.90;
    utterance.pitch = pitch || 0.95;
  }

  const voices = window.speechSynthesis.getVoices();
  const koreanVoices = voices.filter(v => v.lang.includes('ko') || v.lang.includes('KO'));
  
  if (koreanVoices.length > 0) {
    let selectedVoice = koreanVoices[0];
    if (role === 'mother') {
      // 70대 어르신 여성 보이스: 굵직하고 편안한 보이스 우선 선택 (최초 설정)
      selectedVoice = koreanVoices.find(v => 
        v.name.toLowerCase().includes('google') ||
        v.name.toLowerCase().includes('korean')
      ) || koreanVoices[koreanVoices.length - 1];
    } else {
      // 30-40대 딸 보이스: 최초 설정 복원 (Yuna / Sun-Hi / Female)
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
      sendPopupOpenedSignal('medication');
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
    sendPopupOpenedSignal('videocall');
  }, 3000);
}

// --- 한국어 여성 음성 합성 (TTS) 기능: 아침 인사 (중년 딸 목소리) ---
function speakMorningGreeting() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  clearTimeout(morningAudioTimeout);
  morningAudioTimeout = setTimeout(() => {
    // ⭐️ 최초의 정확했던 텍스트 및 발화 설정 완벽 복원
    speakText("엄마 좋은 아침이에요. 잘 잤어요?", 0.95, 'daughter', null, () => {
      // ⭐️ 핵심: TV 음성 안내("잘 잤어요?")가 완전히 끝난 뒤에 리모컨 마이크 활성화 신호 전송!
      sendPopupOpenedSignal('morning');
    });
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

  // 화면에 토스트가 수없이 쌓이지 않도록 최대 2개까지만 유지
  while (container.children.length >= 2) {
    container.removeChild(container.firstChild);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
}

// --- 복약 알림 버튼 기능 ---
function handleMedicationTaken() {
  const popupCard = document.getElementById('medication-popup-card');
  if (popupCard) {
    popupCard.classList.add('hide-card');
  }
  
  openModal('modal-med-done');

  // ⚡ Supabase DB로 복약 완료 상태 실시간 전송
  if (typeof updateSupabaseStatusTaken === 'function') {
    updateSupabaseStatusTaken();
  }

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
  // 1. 남아있는 영상통화 수신 예약 타이머 즉시 취소 (팝업 재오픈 원천 차단!)
  clearTimeout(videoCallTimer);
  videoCallTimer = null;

  // 2. 카운트다운 뱃지 및 영상통화 수신 팝업 카드 확실히 숨김
  const countdownBadge = document.getElementById('videocall-countdown-badge');
  if (countdownBadge) {
    countdownBadge.style.opacity = '0';
  }
  const popupCard = document.getElementById('videocall-popup-card');
  if (popupCard) {
    popupCard.classList.add('hide-card');
  }

  // 3. 리모컨으로 통화 시작 신호 전송 -> 리모컨 마이크 자동 음소거(스피커 에코로 인한 통화 끊김 차단)
  sendCallSignal('CALL_STARTED');

  // 4. 5:5 대화화면 모달 오픈
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

  // [Step 1] 통화 연결 0.6초 후 -> 딸: "엄마 뭐하고 계셨어요?"
  const t1 = setTimeout(() => {
    const speech1 = "엄마 뭐하고 계셨어요?";
    if (daughterText) daughterText.innerText = speech1;

    speakText(speech1, 1.0, 'daughter',
      // onStart: 딸 음성이 '실제 스피커로 출력되는 순간' 말풍선과 카메라 뷰 켜기!
      () => {
        if (daughterBubble) daughterBubble.classList.add('active');
        if (daughterBox) daughterBox.classList.add('speaking');
      },
      // onEnd: 딸 발화 완료 시 말풍선 닫고 0.4초 후 엄마 응답으로 자연스럽게 전환
      () => {
        if (daughterBubble) daughterBubble.classList.remove('active');
        if (daughterBox) daughterBox.classList.remove('speaking');

        const t2 = setTimeout(() => {
          // [Step 2] 엄마(70대 여성 어르신): "드라마 보고 있었어. 저녁은 먹었니?"
          const speech2 = "드라마 보고 있었어. 저녁은 먹었니?";
          if (motherText) motherText.innerText = speech2;

          speakText(speech2, 0.75, 'mother',
            // onStart: 엄마 음성이 '실제 스피커로 출력되는 순간' 말풍선 켜기 (싱크 100% 일치!)
            () => {
              if (motherBubble) motherBubble.classList.add('active');
              if (motherBox) motherBox.classList.add('speaking');
            },
            // onEnd: 엄마 발화 완료 시 말풍선 닫고 0.4초 후 딸 마무리 대화로 전환
            () => {
              if (motherBubble) motherBubble.classList.remove('active');
              if (motherBox) motherBox.classList.remove('speaking');

              const t3 = setTimeout(() => {
                // [Step 3] 딸: "네~. 엄마는요?"
                const speech3 = "네~. 엄마는요?";
                if (daughterText) daughterText.innerText = speech3;

                speakText(speech3, 1.0, 'daughter',
                  () => {
                    if (daughterBubble) daughterBubble.classList.add('active');
                    if (daughterBox) daughterBox.classList.add('speaking');
                  },
                  () => {
                    // 1.5초 후 말풍선 정리
                    const t4 = setTimeout(() => {
                      if (daughterBubble) daughterBubble.classList.remove('active');
                      if (daughterBox) daughterBox.classList.remove('speaking');
                    }, 1500);
                    conversationTimeouts.push(t4);
                  }
                );
              }, 400);
              conversationTimeouts.push(t3);
            }
          );
        }, 400);
        conversationTimeouts.push(t2);
      }
    );
  }, 600);

  conversationTimeouts.push(t1);
}

function handleCallDecline() {
  clearTimeout(videoCallTimer);
  videoCallTimer = null;

  const popupCard = document.getElementById('videocall-popup-card');
  if (popupCard) {
    popupCard.classList.add('hide-card');
  }
  sendCallSignal('CALL_ENDED');
  showToast('영상통화를 거절하였습니다. 이전 TV 방송으로 돌아갑니다.', '📺');
}

// [통화 종료] 버튼 클릭 시 라이브 통화 창과 수신 카드가 모두 닫히며 일일 드라마 TV 화면으로 바로 복귀!
function endCall() {
  clearTimeout(videoCallTimer);
  videoCallTimer = null;

  closeModal('modal-videocall-active');
  const popupCard = document.getElementById('videocall-popup-card');
  if (popupCard) {
    popupCard.classList.add('hide-card');
  }
  sendCallSignal('CALL_ENDED');
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

let activeRemoteConn = null;

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
        activeRemoteConn = conn;
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
  
  // 현재 활성화된 화면 식별
  const activePageEl = document.querySelector('.tv-page.active');
  const activePageId = activePageEl ? activePageEl.id.replace('page-', '') : (window.location.hash.replace('#', '') || 'overview');
  
  // ⭐️ 핵심: 영상통화 모달(modal-videocall-active)은 '일반 알림 확인 모달'이 아니므로,
  // 초록 버튼(확인/수락/대화)으로 닫히면 안 됨! 오직 통화 종료(빨강 버튼)로만 닫혀야 함!
  const isCallActive = activeCallModal && activeCallModal.classList.contains('open');
  const openModalElem = document.querySelector('.custom-modal-overlay.open:not(#modal-videocall-active)');

  switch (action) {
    // 🟢 초록 버튼: 확인 / 수락 / 먹었어 / 잘 잤어
    case 'BTN_GREEN':
      // 0. 영상통화가 이미 연결되어 통화 중인 경우 -> 통화 중 대화("응", "그래", "알았어" 등)이므로 화면을 닫지 않고 유지
      if (isCallActive) {
        return;
      }

      // 1. 영상통화 수신 팝업이 떠 있는 경우 -> 즉시 통화 수락!
      if (videoPopupCard && !videoPopupCard.classList.contains('hide-card')) {
        handleCallAccept();
        return;
      }

      // 2. 열려 있는 일반 모달이 있는 경우 -> 닫기 / 확인
      if (openModalElem) {
        openModalElem.classList.remove('open');
        showToast('📱 [초록 버튼] 확인 처리되었습니다.', '🟢');
      }
      // 3. 아침 인사 페이지인 경우
      else if (activePageId === 'morning') {
        handleMorningDialogClick();
        showToast('📱 [초록 버튼] 아침 인사 "잘 잤어" 응답 완료!', '🟢');
      }
      // 4. 복약 알림 페이지인 경우
      else if (activePageId === 'medication') {
        handleMedicationTaken();
        showToast('📱 [초록 버튼] 복약 완료 기록되었습니다!', '🟢');
      }
      // 5. 영상통화 페이지인 경우
      else if (activePageId === 'videocall') {
        handleCallAccept();
        showToast('📱 [초록 버튼] 영상통화를 수락했습니다!', '🟢');
      }
      // 6. 기타 화면
      else {
        showToast('📱 [초록 버튼] 확인되었습니다.', '🟢');
      }
      break;

    // 🔴 빨강 버튼: 거절 / 나중에 / 통화 종료 / 닫기
    case 'BTN_RED':
      // 1. 영상통화 진행 중인 라이브 모달이 열려 있는 경우 -> 통화 종료
      if (activeCallModal && activeCallModal.classList.contains('open')) {
        endCall();
        showToast('📱 [빨강 버튼] 영상통화를 종료했습니다.', '🔴');
      }
      // 2. 아침 인사 대화창이 떠 있는 경우 -> 닫기
      else if (morningWindow && !morningWindow.classList.contains('hide-dialog')) {
        closeMorningDialogOnly();
        showToast('📱 [빨강 버튼] 아침 인사가 닫혔습니다.', '🔴');
      }
      // 3. 복약 알림 팝업이 떠 있는 경우 -> 나중에 먹을게
      else if (medPopupCard && !medPopupCard.classList.contains('hide-card')) {
        handleMedicationSnooze();
        showToast('📱 [빨강 버튼] 복약이 연기되었습니다.', '🔴');
      }
      // 4. 영상통화 수신 알림 팝업이 떠 있는 경우 -> 거절
      else if (videoPopupCard && !videoPopupCard.classList.contains('hide-card')) {
        handleCallDecline();
        showToast('📱 [빨강 버튼] 영상통화를 거절했습니다.', '🔴');
      }
      // 5. 열려 있는 모달창 닫기
      else {
        const openModalElem = document.querySelector('.custom-modal-overlay.open');
        if (openModalElem) {
          openModalElem.classList.remove('open');
          showToast('📱 [빨강 버튼] 팝업 창을 닫았습니다.', '🔴');
        } else {
          showToast('📱 [빨강 버튼] 취소되었습니다.', '🔴');
        }
      }
      break;

    // ⚪ 흰색 버튼: 🚨 119 긴급 구조 요청
    case 'BTN_119':
      openModal('modal-emergency-119');
      showToast('🚨 [119 긴급 구조] 119 구급대 및 자녀에게 위치와 알림이 발송되었습니다!', '🚨');
      speakText('백십구 긴급 구조 요청이 접수되었습니다. 자녀와 구급대에 알림을 보냅니다.', 0.95, 'daughter');
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

function sendPopupOpenedSignal(popupType) {
  const payload = {
    action: 'POPUP_OPENED',
    popupType: popupType,
    timestamp: Date.now()
  };

  // 1. BroadcastChannel 전송 (동일 브라우저 탭)
  const broadcastChannel = new BroadcastChannel('hyotv_remote_channel');
  broadcastChannel.postMessage(payload);

  // 2. PeerJS P2P 연결된 외부 스마트폰으로 전송
  if (activeRemoteConn && activeRemoteConn.open) {
    activeRemoteConn.send(payload);
    console.log('[TV Listener] PeerJS로 POPUP_OPENED 신호 전송 완료!');
  }
}

// 영상통화 시작/종료 상태를 리모컨으로 브로드캐스팅하여 리모컨 마이크 자동 온오프 제어
function sendCallSignal(actionType) {
  const payload = {
    action: actionType,
    timestamp: Date.now()
  };

  try {
    const broadcastChannel = new BroadcastChannel('hyotv_remote_channel');
    broadcastChannel.postMessage(payload);
  } catch(e) {}

  try {
    if (activeRemoteConn && activeRemoteConn.open) {
      activeRemoteConn.send(payload);
    }
  } catch(e) {}
}

// ----------------------------------------------------
// 🎙️ TV 모니터 자체 항시 핸즈프리 음성 인식 (Continuous STT)
// ----------------------------------------------------
let tvRecognition = null;
let lastTvVoiceActionTime = 0;

function initTvVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  tvRecognition = new SpeechRecognition();
  tvRecognition.lang = 'ko-KR';
  tvRecognition.continuous = true;
  tvRecognition.interimResults = false; // 중간 음소 오인식 폭주 방지: 완성된 문장만 감지!

  tvRecognition.onend = () => {
    setTimeout(() => {
      if (tvRecognition) {
        try {
          tvRecognition.start();
        } catch (e) {}
      }
    }, 500);
  };

  tvRecognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      // ⭐️ 핵심: 중간 진행형(interim) 소음 무시, 완성된 발화(isFinal)만 1회 처리!
      if (event.results[i].isFinal) {
        const transcript = event.results[i][0].transcript.trim();
        if (transcript) {
          console.log('[TV STT 완성 음성 수신]:', transcript);
          handleTvVoiceCommand(transcript);
        }
      }
    }
  };

  tvRecognition.onerror = (err) => {};

  try {
    tvRecognition.start();
  } catch (e) {}
}

function handleTvVoiceCommand(text) {
  const lower = text.replace(/\s+/g, '').toLowerCase();
  const now = Date.now();

  // 1. TV 자체 안내 멘트(에코) 방지: TV가 스스로 말한 안내 문장 자체는 무시
  const tvPromptEchoes = [
    '엄마좋은아침이에요잘잤어요', '좋은아침이에요잘잤어요', '잘잤어요', '잘자써요', '잘캈어요', '잘컸어요', '잘주무셨어요', '잘잤니',
    '엄마좋은아침', '좋은아침이에요', '엄마좋은아침이에요', '좋은아침',
    '엄마약먹을시간', '약먹을시간이야', '약먹을시간',
    '엄마뭐하고계셨어요', '뭐하고계셨어요', '드라마보고있었어', '저녁은먹었니', '네엄마는요'
  ];

  // ⭐️ 핵심: TV TTS가 재생 중이거나 발화가 끝난 지 1.5초 이내(스피커 잔향 구간)에 들어온 TV 자체 음성은 100% 무시!
  const isWithinEchoWindow = isTtsSpeaking || (now - lastTtsEndTime < 1500);
  if (isWithinEchoWindow && tvPromptEchoes.some(echo => lower.includes(echo))) {
    console.log('[TV STT] TV 자체 안내 방송/질문 에코 완벽 무시:', text);
    return;
  }

  // 2. 1.5초 내 연속 중복 실행 방지 (디바운스 락)
  if (now - lastTvVoiceActionTime < 1500) {
    return;
  }

  // ⭐️ 3. [초중요 버그 수정] 영상통화 라이브 진행 중일 때의 음성 보호!
  const activeCallModal = document.getElementById('modal-videocall-active');
  const isCallActive = activeCallModal && activeCallModal.classList.contains('open');
  if (isCallActive) {
    // 통화 중에는 오직 명확한 통화 종료 음성("통화종료", "전화끊어", "통화끝", "전화끊자", "끊어")만 인식!
    // '아니', '이따', '싫어', '아직', '안돼', '먹었어' 등 통화 중 일상 대화로 인해 통화가 닫히는 현상을 원천 차단!
    const callHangupKeywords = ['통화종료', '전화끊어', '전화끊자', '통화끝', '통화종료해줘', '통화종료할게'];
    if (callHangupKeywords.some(kw => lower.includes(kw))) {
      lastTvVoiceActionTime = now;
      handleRemoteAction('BTN_RED');
    }
    // 그 외 통화 중 모든 대화는 통화 유지!
    return;
  }

  // 🚨 119 긴급 명령
  const urgentKeywords = [
    '119', '일일구', '백십구', '구조', '응급', '도와줘', '도와줘요', '살려줘',
    '살려주세요', '구급차', '병원', '아파', '아파요', '숨차', '숨이차'
  ];
  if (urgentKeywords.some(kw => lower.includes(kw))) {
    lastTvVoiceActionTime = now;
    handleRemoteAction('BTN_119');
    return;
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
    lastTvVoiceActionTime = now;
    handleRemoteAction('BTN_RED');
    return;
  }

  // 🟢 초록 계열 (O, 수락, 긍정, 복약 완료, 통화 연결, 아침 인사) - 단일 모음 '어' 제외
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
    
    // 🌅 아침 인사 응답 (부모님의 실제 응답 어간: 잘 잤어, 잘 잤다, 푹 잤어 등)
    '잘잤어', '잘잤다', '잘잤지', '잘잤네', '잘자서', '잘잣', '푹잤', '푹자', '일어났', '자고일어'
  ];
  if (greenKeywords.some(kw => lower.includes(kw))) {
    lastTvVoiceActionTime = now;
    handleRemoteAction('BTN_GREEN');
    return;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initTvVoiceRecognition();
});

