// ====================================================
// ⚡ 효TV - Supabase 실시간 클라우드 DB 연동 모듈
// ====================================================

const SUPABASE_URL = 'https://krdtvpbnjufmmbpkprvt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyZHR2cGJuanVmbW1icGtwcnZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE1ODAsImV4cCI6MjEwNDUxNzU4MH0.ovUusbqm5pReV2VOcN-bU4HQ2Fq_QhDf7wiArtyFQfE';

let supabaseClient = null;
let currentMedicationId = null;

// 1. Supabase 클라이언트 초기화
function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.warn('[Supabase] SDK가 로드되지 않았습니다. CDN 스크립트를 확인하세요.');
    return;
  }

  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Supabase] 클라이언트 초기화 완료 ⚡');
    setSupabaseStatus(true);

    // 초기 데이터 로드 & 실시간 구독 시작
    fetchLatestMedicationData();
    subscribeToRealtimeUpdates();
  } catch (err) {
    console.error('[Supabase] 초기화 오류:', err);
    setSupabaseStatus(false);
  }
}

// 2. Supabase에서 최신 복약 및 알림 데이터 조회 (Read / Fetch)
async function fetchLatestMedicationData() {
  if (!supabaseClient) return;

  const candidateTables = ['medications', 'medication', 'alarms', 'alerts', 'reminders', 'schedules'];
  let fetchedData = null;
  let activeTable = null;

  for (const table of candidateTables) {
    try {
      // id 기준 최신순 정렬 (created_at 또는 updated_at 없어도 안전 동작)
      const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .order('id', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        fetchedData = data[0];
        activeTable = table;
        console.log(`[Supabase] '${table}' 테이블에서 최신 데이터 수신:`, fetchedData);
        break;
      }
    } catch (e) {
      // 테이블 미존재 시 조용히 다음 후보 시도
    }
  }

  if (fetchedData) {
    applyDataToHyoTvUI(fetchedData);
  } else {
    console.log('[Supabase] 활성 테이블 대기 중 - 기본 데이터셋 유지');
  }
}

// 오늘 날짜 및 요일 포맷 헬퍼 (예: "9월 11일 (금)")
function getTodayDateString() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[now.getDay()];
  return `${month}월 ${date}일 (${dayName})`;
}

// 실제 확인(클릭)한 현재 실시간 시각 헬퍼 (예: "9월 11일 (금) 17:42")
function getFormattedCurrentTime() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[now.getDay()];
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${month}월 ${date}일 (${dayName}) ${hours}:${minutes}`;
}

// 복약 완료 모달(#modal-med-done) 내부 텍스트를 "실제 확인한 현재 시각"으로 갱신
function updateMedicationDoneModalText(name, actualConfirmedTime) {
  const modalBody = document.getElementById('med-done-modal-body') || document.querySelector('#modal-med-done .modal-body-text');
  if (!modalBody) return;

  const displayTime = actualConfirmedTime || getFormattedCurrentTime();
  const medName = name || window.currentMedicationName || '당뇨약';

  modalBody.innerText = `${displayTime} 복약(${medName}) 복용이 완료되었습니다.`;
}

// ⚡ Supabase user_logs 테이블에 실제 확인 시각 영구 저장 공통 함수
async function logUserActionToSupabase(action, details = {}) {
  if (!supabaseClient) return;

  try {
    const recordTimeIso = new Date().toISOString();
    const recordTimeLocal = getFormattedCurrentTime();

    const payload = {
      action: action,
      details: {
        ...details,
        confirmed_at: recordTimeIso,
        confirmed_at_local: recordTimeLocal
      }
    };

    const { data, error } = await supabaseClient
      .from('user_logs')
      .insert([payload]);

    if (error) {
      console.warn(`[Supabase Log] '${action}' 로그 기록 에러:`, error);
    } else {
      console.log(`[Supabase Log] ⚡ '${action}' 실제 확인 시간 영구 저장 완료 (${recordTimeLocal}):`, payload);
    }
  } catch (err) {
    console.warn(`[Supabase Log] '${action}' 로그 예외:`, err);
  }
}

// 3. 수신된 Supabase 데이터를 효TV 화면 UI에 동적 반영
function applyDataToHyoTvUI(item) {
  if (!item) return;
  currentMedicationId = item.id || null;

  // 오늘 날짜 및 요일 엘리먼트 자동 반영
  const todayDateStr = getTodayDateString();
  document.querySelectorAll('.medication-today-date, #med-today-date').forEach(el => {
    el.innerText = todayDateStr;
  });

  // 1) 복약 알림 시간 파싱 (문자열 또는 자녀 웹앱의 times 배열 지원)
  let timeVal = item.time || item.scheduled_time || item.scheduled_at;
  if (!timeVal && Array.isArray(item.times) && item.times.length > 0) {
    timeVal = item.times[0];
  }

  // 🔔 종이모티콘 + 날짜(요일) + 시간 한 줄 동시 표기
  const dateLabels = document.querySelectorAll('.medication-date-label, #med-date-label');
  const timeText = timeVal || '17:30';
  dateLabels.forEach(el => {
    el.innerText = `🔔 ${todayDateStr} ${timeText}`;
  });

  const titleEl = document.getElementById('med-title-text') || document.querySelector('.medication-title');
  const directTimeSpan = document.querySelector('.medication-time span');
  if (directTimeSpan && timeVal) {
    directTimeSpan.innerText = timeVal;
  }

  // 2) 약 이름 또는 제목 파싱
  const titleVal = item.name || item.title || item.medicine_name || item.message;
  if (titleEl && titleVal) {
    const formattedTitle = titleVal.includes('약') ? `${titleVal} 먹을 시간이야!` : `${titleVal} 복약 시간이야!`;
    titleEl.innerText = formattedTitle;
    if (typeof currentMedicationNoticeText !== 'undefined') {
      currentMedicationNoticeText = `엄마 ${titleVal} 먹을 시간이야`;
    }
  }

  // 3) 복약 완료 팝업 모달 문구 실시간 동적 연동 (오늘날짜, 요일, 시간, 약이름)
  window.currentMedicationName = titleVal || '당뇨약';
  window.currentMedicationTime = timeText;
  updateMedicationDoneModalText(window.currentMedicationName, window.currentMedicationTime);

  // 4) 새 알림 수신 시 효TV에 복약 화면 자동 전환 & 팝업 오픈 트리거 및 토스트 알림!
  const displayTitle = titleVal || '복약 시간';
  const displayTime = timeVal ? ` (${timeVal})` : '';
  showToast(`⚡ Supabase 알림 수신: ${displayTitle}${displayTime}`, '💊');

  if (typeof switchPage === 'function') {
    switchPage('medication');
  } else if (typeof triggerMedicationNotice === 'function') {
    triggerMedicationNotice();
  }
}

// 4. 실시간(Realtime) 변경 사항 구독 (자녀 웹앱에서 등록 시 0.1초 만에 반응)
let currentIncomingCallId = null;

// 4. 실시간(Realtime) 변경 사항 구독 (복약 알림 + call_logs 실시간 통화 수신 감지)
function subscribeToRealtimeUpdates() {
  if (!supabaseClient) return;

  try {
    // 1) 전체 DB 변경 구독 채널
    supabaseClient
      .channel('hyotv-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          console.log('[Supabase Realtime] 실시간 DB 변경 감지:', payload);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newItem = payload.new;
            if (!newItem) return;

            // 1) 복약 로그(medication_logs) 테이블 새 데이터(INSERT) 감지 💊
            if (payload.table === 'medication_logs' && payload.eventType === 'INSERT') {
              handleMedicationLogInsert(newItem);
            }
            // 2) 통화 로그(call_logs) 테이블 변경 감지 📞
            else if (payload.table === 'call_logs' || ('call_type' in newItem && 'target' in newItem)) {
              handleCallLogChange(newItem);
            } 
            // 3) 복약 알림(medications) 설정 테이블 변경 감지
            else if (payload.table === 'medications' || ('cycle_type' in newItem || 'times' in newItem)) {
              applyDataToHyoTvUI(newItem);
              showToast('⚡ 자녀 웹앱에서 실시간 알림이 도착했습니다!', '🔔');
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Supabase Realtime] 구독 상태:', status);
        if (status === 'SUBSCRIBED') {
          setSupabaseStatus(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setSupabaseStatus(false);
        }
      });

    // 2) call_logs 테이블 전용 명시적 구독 채널 (이중 안전장치)
    supabaseClient
      .channel('hyotv-calls-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_logs' },
        (payload) => {
          console.log('[Supabase Realtime Calls] 통화 테이블 변경 감지:', payload);
          if (payload.new) {
            handleCallLogChange(payload.new);
          }
        }
      )
      .subscribe();

    // 3) 💊 medication_logs 테이블 전용 명시적 구독 채널 (INSERT 실시간 감지)
    supabaseClient
      .channel('hyotv-medication-logs-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'medication_logs' },
        (payload) => {
          console.log('[Supabase Realtime Medication Logs] 새 복약 알림 INSERT 수신 💊:', payload);
          if (payload.new) {
            handleMedicationLogInsert(payload.new);
          }
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('[Supabase Realtime] 구독 설정 경고:', err);
    setSupabaseStatus(false);
  }
}

// 💊 실시간 복약 알림 수신 처리기 (medication_logs에 INSERT 발생 시 즉시 TV 팝업 오픈)
let currentMedicationLogId = null;

function handleMedicationLogInsert(logData) {
  if (!logData) return;
  console.log('[Medication Handler] 새 복약 알림 신호 수신:', logData);

  currentMedicationLogId = logData.id;
  window.currentMedicationLogId = logData.id;

  // 약 이름 추출
  const medName = logData.medication_name || logData.name || logData.medicine_name || '당뇨약';
  window.currentMedicationName = medName;

  // 예정 시각 추출 (scheduled_at 필드가 있으면 사용, 없으면 현재 시각)
  let timeStr = '';
  if (logData.scheduled_at) {
    try {
      const d = new Date(logData.scheduled_at);
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      timeStr = `${hours}:${mins}`;
    } catch (e) {}
  }
  if (!timeStr) {
    const now = new Date();
    timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
  window.currentMedicationTime = timeStr;

  // 1. 복약 팝업 카드 내부 텍스트 갱신 (종 + 날짜(요일) + 시간 + 약 이름)
  const dateLabel = document.getElementById('med-date-label');
  const titleText = document.getElementById('med-title-text');
  if (dateLabel) {
    dateLabel.innerText = `🔔 ${getTodayDateString()} ${timeStr}`;
  }
  if (titleText) {
    titleText.innerText = `${medName} 먹을 시간이야!`;
  }

  // 2. 복약 완료 안내 모달용 텍스트 사전 동기화
  updateMedicationDoneModalText(medName, `${getTodayDateString()} ${timeStr}`);

  // 3. TV 화면을 복약 알림 탭으로 즉시 전환
  if (typeof switchPage === 'function') {
    switchPage('medication');
  }

  // 4. 3초 대기 없이 복약 알림 팝업창을 화면에 즉시 오픈!
  const popupCard = document.getElementById('medication-popup-card');
  const countdownBadge = document.getElementById('med-countdown-badge');
  if (popupCard) {
    popupCard.classList.remove('hide-card');
  }
  if (countdownBadge) {
    countdownBadge.style.opacity = '0';
  }

  // 5. 토스트 알림 표시 및 딸 음성 안내 발화
  showToast(`💊 [복약 알림] ${medName} 복약 시간입니다!`, '💊');
  setTimeout(() => {
    if (typeof speakMedicationNotice === 'function') {
      speakMedicationNotice(`엄마, ${medName} 먹을 시간이야.`);
    }
    if (typeof sendPopupOpenedSignal === 'function') {
      sendPopupOpenedSignal('medication');
    }
  }, 500);
}

// 실시간 통화 수신 처리기 (웹앱에서 [전화 통화] 또는 [영상 통화] 클릭 시 팝업 오픈)
function handleCallLogChange(callData) {
  if (!callData) return;
  console.log('[Call Handler] 웹앱 통화 신호 수신:', callData.id, callData.call_type, callData.status);

  // status가 'calling', 'ringing'이거나, 신규 통화 요청(rejected/ended가 아님)
  const isCalling = callData.status === 'calling' || 
                    callData.status === 'ringing' || 
                    (!callData.status && callData.call_type) ||
                    (callData.status !== 'rejected' && callData.status !== 'ended' && callData.status !== 'accepted' && callData.call_type);

  // ⭐️ 이미 음성 통화 또는 영상 통화가 진행 중인 경우, 중복 신호로 인해 대화 시퀀스가 리셋되는 현상 원천 차단!
  const isVoiceActive = typeof isVoiceCallActiveInModal !== 'undefined' && isVoiceCallActiveInModal;
  const videoModal = document.getElementById('modal-videocall-active');
  const isVideoActive = videoModal && videoModal.classList.contains('open');

  if (isVoiceActive || isVideoActive) {
    if (callData.status === 'rejected' || callData.status === 'ended') {
      if (typeof closeGlobalIncomingCallModal === 'function') {
        closeGlobalIncomingCallModal();
      }
      if (typeof endCall === 'function' && isVideoActive) {
        endCall();
      } else if (typeof endVoiceCallInModal === 'function' && isVoiceActive) {
        endVoiceCallInModal();
      }
    } else {
      console.log('[Call Handler] 통화가 이미 진행 중이므로 중복 신호 무시:', callData.id, callData.status);
    }
    return;
  }

  if (isCalling) {
    handleIncomingCallSignal(callData);
  } else if (callData.status === 'rejected' || callData.status === 'ended') {
    if (typeof closeGlobalIncomingCallModal === 'function') {
      closeGlobalIncomingCallModal();
    }
  }
}

function handleIncomingCallSignal(callData) {
  currentIncomingCallId = callData.id || null;
  const isVoice = callData.call_type === 'voice';
  window.currentIncomingCallType = isVoice ? 'voice' : 'video';
  const callTypeName = isVoice ? '전화(음성) 통화' : '영상 통화';

  // 1. 발신자 정보 및 모달 UI 리셋
  const nameEl = document.getElementById('incoming-caller-name');
  const typeEl = document.getElementById('incoming-call-type-text');
  if (nameEl) nameEl.innerText = '';
  if (typeEl) typeEl.innerText = `${callTypeName} 요청 중...`;

  if (typeof resetIncomingModalUI === 'function') {
    resetIncomingModalUI();
  }

  // 2. 최상단 전역 통화 수신 모달 오픈
  if (typeof openModal === 'function') {
    openModal('modal-incoming-call-global');
  }

  // 3. 토스트 및 딸 목소리 TTS 음성 안내
  showToast(`📞 [${callTypeName}] 전화가 걸려왔습니다!`, '📞');

  let remoteNotified = false;
  const notifyRemoteMic = () => {
    if (remoteNotified) return;
    remoteNotified = true;
    if (typeof sendPopupOpenedSignal === 'function') {
      sendPopupOpenedSignal('incoming_call');
    }
  };

  if (typeof speakText === 'function') {
    const speechMsg = isVoice ? '엄마, 전화가 왔어요. 통화를 수락하시겠어요?' : '엄마, 영상 통화가 왔어요. 통화를 수락하시겠어요?';
    // ⭐️ 핵심: TV TTS 음성 안내가 완전히 끝난 시점에 리모컨 마이크를 활성화하여 TV 스피커 소리로 인한 마이크 오인식/먹통 방지!
    speakText(speechMsg, 0.95, 'daughter', null, () => {
      notifyRemoteMic();
    });
    // TTS 브라우저 미지원 또는 지연 시 대비 2.5초 안전 타임아웃
    setTimeout(notifyRemoteMic, 2500);
  } else {
    notifyRemoteMic();
  }
}

// call_logs 행의 status 업데이트 (accepted, rejected, ended)
async function updateCallLogStatus(callId, newStatus) {
  const targetId = callId || currentIncomingCallId;
  if (!supabaseClient || !targetId) return;

  try {
    const { data, error } = await supabaseClient
      .from('call_logs')
      .update({ status: newStatus })
      .eq('id', targetId);

    if (error) {
      console.warn(`[Supabase] call_logs (id: ${targetId}) status=${newStatus} 업데이트 에러:`, error);
    } else {
      console.log(`[Supabase] call_logs (id: ${targetId}) status -> '${newStatus}' 업데이트 완료 ⚡`);
    }
  } catch (err) {
    console.warn('[Supabase] updateCallLogStatus 예외:', err);
  }
}

// 💊 medication_logs 행의 status 업데이트 (taken: 먹었어, missed: 나중에 먹을게)
async function updateMedicationLogStatus(logId, newStatus) {
  const targetId = logId || window.currentMedicationLogId || currentMedicationLogId;
  if (!supabaseClient || !targetId) {
    console.warn('[Supabase] medication_logs 업데이트 대상 ID 없음');
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('medication_logs')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetId);

    if (error) {
      console.warn(`[Supabase] medication_logs (id: ${targetId}) status=${newStatus} 업데이트 에러:`, error);
    } else {
      console.log(`[Supabase] medication_logs (id: ${targetId}) status -> '${newStatus}' 업데이트 완료 💊`);
    }
  } catch (err) {
    console.warn('[Supabase] updateMedicationLogStatus 예외:', err);
  }
}

// 5. 어르신이 '먹었어(O)' 누를 때 Supabase DB 상태 업데이트 (Update)
async function updateSupabaseStatusTaken() {
  if (!supabaseClient || !currentMedicationId) return;

  const candidateTables = ['medications', 'medication', 'alarms', 'alerts', 'reminders'];
  for (const table of candidateTables) {
    try {
      const { data, error } = await supabaseClient
        .from(table)
        .update({ status: 'completed', taken_at: new Date().toISOString() })
        .eq('id', currentMedicationId);

      if (!error) {
        console.log(`[Supabase] '${table}' 테이블에 복약 완료 상태 동기화 완료!`);
        break;
      }
    } catch (e) {}
  }
}

// 6. 상태 뱃지 표시 헬퍼 (연결됨: 초록색, 연결 안 됨: 빨간색)
function setSupabaseStatus(isConnected) {
  const badge = document.getElementById('supabase-status-badge');
  if (!badge) return;

  if (isConnected) {
    badge.className = 'supabase-status-badge connected';
    badge.innerHTML = '<span class="supabase-dot"></span><span>Supabase</span>';
    badge.title = 'Supabase 연결됨';
  } else {
    badge.className = 'supabase-status-badge disconnected';
    badge.innerHTML = '<span class="supabase-dot"></span><span>Supabase</span>';
    badge.title = 'Supabase 연결 안 됨';
  }
}

// 하위 호환성 유지
function updateSupabaseStatusBadge(text, color) {
  const isConnected = color === '#22c55e' || color === true || (typeof text === 'string' && text.includes('연결'));
  setSupabaseStatus(isConnected);
}

// 온라인/오프라인 네트워크 상태 이벤트 감지
window.addEventListener('online', () => {
  if (supabaseClient) setSupabaseStatus(true);
});
window.addEventListener('offline', () => {
  setSupabaseStatus(false);
});

// 브라우저 로드 시 자동 실행
window.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});
