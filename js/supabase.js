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
      const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
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

// 3. 수신된 Supabase 데이터를 효TV 화면 UI에 동적 반영
function applyDataToHyoTvUI(item) {
  if (!item) return;
  currentMedicationId = item.id || null;

  // 1) 복약 알림 시간 및 제목 업데이트
  const dateLabel = document.querySelector('.medication-date-label');
  const titleEl = document.getElementById('med-title-text');

  if (dateLabel && (item.time || item.scheduled_time || item.scheduled_at)) {
    const timeVal = item.time || item.scheduled_time || item.scheduled_at;
    dateLabel.innerText = `🔔 ${timeVal}`;
  }

  if (titleEl && (item.title || item.medicine_name || item.name || item.message)) {
    const titleVal = item.title || item.medicine_name || item.name || item.message;
    titleEl.innerText = titleVal.includes('약') ? titleVal : `${titleVal} 복약 시간이야!`;
  }

  // 2) 만약 새 알림이 'pending' 상태이면 효TV에 즉시 팝업 오픈 트리거!
  if (item.status === 'pending' || item.is_active === true) {
    showToast(`⚡ Supabase 새 알림 수신: ${item.title || '복약 시간'}`, '💊');
    if (typeof triggerMedicationNotice === 'function') {
      triggerMedicationNotice();
    }
  }
}

// 4. 실시간(Realtime) 변경 사항 구독 (자녀 웹앱에서 등록 시 0.1초 만에 반응)
function subscribeToRealtimeUpdates() {
  if (!supabaseClient) return;

  try {
    supabaseClient
      .channel('hyotv-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          console.log('[Supabase Realtime] 실시간 DB 변경 감지:', payload);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newItem = payload.new;
            applyDataToHyoTvUI(newItem);
            showToast('⚡ 자녀 웹앱에서 실시간 알림이 도착했습니다!', '🔔');
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
  } catch (err) {
    console.warn('[Supabase Realtime] 구독 설정 경고:', err);
    setSupabaseStatus(false);
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
