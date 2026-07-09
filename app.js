const APP_STORAGE_KEY = "swear-word-cash-register.v2";
const APP_UI_KEY = "swear-word-cash-register.ui";

const createId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();
const normalizeArray = (value) => (Array.isArray(value) ? value : []);
const parseMoney = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
};

const formatTimeOnly = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return [hours, minutes, secs].map((item) => String(item).padStart(2, "0")).join(":");
  return [minutes, secs].map((item) => String(item).padStart(2, "0")).join(":");
};

const toDateInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const combineDateTime = (dateValue, timeValue) => {
  if (!dateValue) return nowIso();
  const merged = new Date(`${dateValue}T${timeValue || "00:00"}:00`);
  return Number.isNaN(merged.getTime()) ? nowIso() : merged.toISOString();
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const readUiState = () => {
  try {
    return JSON.parse(localStorage.getItem(APP_UI_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeUiState = (patch) => {
  localStorage.setItem(APP_UI_KEY, JSON.stringify({ ...readUiState(), ...patch }));
};

const defaultAppState = () => ({
  version: 2,
  priceLabels: [],
  audioRecords: [],
  imageRecords: [],
  detailedLabelRecords: [],
  fileBlobs: []
});

const migrateLegacyState = (raw) => {
  const base = defaultAppState();
  if (!raw || typeof raw !== "object") return base;

  const next = {
    version: 2,
    priceLabels: normalizeArray(raw.priceLabels),
    audioRecords: normalizeArray(raw.audioRecords),
    imageRecords: normalizeArray(raw.imageRecords),
    detailedLabelRecords: normalizeArray(raw.detailedLabelRecords),
    fileBlobs: normalizeArray(raw.fileBlobs)
  };

  if ((!next.priceLabels.length || !next.detailedLabelRecords.length) && (raw.labels || raw.records)) {
    next.priceLabels = normalizeArray(raw.labels).map((label) => ({
      id: label.id || createId(),
      labelName: label.labelName || label.name || "未命名標籤",
      amount: parseMoney(label.amount),
      isActive: label.isActive !== false,
      createdAt: label.createdAt || nowIso(),
      updatedAt: label.updatedAt || label.createdAt || nowIso()
    }));

    next.detailedLabelRecords = normalizeArray(raw.records).map((record) => {
      const sourceType = record.sourceType || (record.audioTimestamp != null ? "audio" : "image");
      const recordTime = record.recordTime || record.createdAt || nowIso();
      return {
        id: record.id || createId(),
        sourceType,
        sourceRecordId: record.sourceRecordId || record.audioRecordId || record.imageRecordId || createId(),
        sourceFileName: record.sourceFileName || record.fileName || (sourceType === "audio" ? "既有音檔" : "既有影像"),
        recordDate: record.recordDate || toDateInputValue(recordTime),
        recordTime,
        audioTimestamp: sourceType === "audio" ? Number(record.audioTimestamp) || 0 : null,
        labelName: record.labelName || record.label || "未命名標籤",
        amount: parseMoney(record.amount),
        note: record.note || "",
        createdAt: record.createdAt || recordTime,
        updatedAt: record.updatedAt || recordTime
      };
    });
  }

  next.priceLabels = next.priceLabels.map((label) => ({
    id: label.id || createId(),
    labelName: label.labelName || "未命名標籤",
    amount: parseMoney(label.amount),
    isActive: label.isActive !== false,
    createdAt: label.createdAt || nowIso(),
    updatedAt: label.updatedAt || label.createdAt || nowIso()
  }));

  next.audioRecords = next.audioRecords.map((record) => ({
    id: record.id || createId(),
    sourceType: record.sourceType || "uploaded_audio",
    fileName: record.fileName || "未命名音檔",
    recordDate: record.recordDate || toDateInputValue(record.recordTime || record.createdAt || nowIso()),
    recordTime: record.recordTime || record.createdAt || nowIso(),
    duration: Number(record.duration) || 0,
    localFileReference: record.localFileReference || "",
    initialMarkers: normalizeArray(record.initialMarkers)
      .map((marker) => ({
        id: marker.id || createId(),
        audioRecordId: marker.audioRecordId || record.id || "",
        timestamp: Number(marker.timestamp) || 0,
        createdAt: marker.createdAt || nowIso()
      }))
      .sort((left, right) => left.timestamp - right.timestamp),
    createdAt: record.createdAt || record.recordTime || nowIso(),
    updatedAt: record.updatedAt || record.recordTime || nowIso()
  }));

  next.imageRecords = next.imageRecords.map((record) => ({
    id: record.id || createId(),
    fileName: record.fileName || "未命名影像",
    recordDate: record.recordDate || toDateInputValue(record.recordTime || record.createdAt || nowIso()),
    recordTime: record.recordTime || record.createdAt || nowIso(),
    localFileReference: record.localFileReference || "",
    createdAt: record.createdAt || record.recordTime || nowIso(),
    updatedAt: record.updatedAt || record.recordTime || nowIso()
  }));

  next.detailedLabelRecords = next.detailedLabelRecords.map((record) => ({
    id: record.id || createId(),
    sourceType: record.sourceType === "image" ? "image" : "audio",
    sourceRecordId: record.sourceRecordId || createId(),
    sourceFileName: record.sourceFileName || "未命名來源",
    recordDate: record.recordDate || toDateInputValue(record.recordTime || record.createdAt || nowIso()),
    recordTime: record.recordTime || record.createdAt || nowIso(),
    audioTimestamp: record.sourceType === "image" ? null : Number(record.audioTimestamp) || 0,
    labelName: record.labelName || "未命名標籤",
    amount: parseMoney(record.amount),
    note: record.note || "",
    createdAt: record.createdAt || record.recordTime || nowIso(),
    updatedAt: record.updatedAt || record.recordTime || nowIso()
  }));

  next.fileBlobs = next.fileBlobs.map((blob) => ({
    id: blob.id || createId(),
    fileName: blob.fileName || "未命名檔案",
    mimeType: blob.mimeType || "application/octet-stream",
    dataUrl: blob.dataUrl || "",
    createdAt: blob.createdAt || nowIso()
  }));

  return next;
};

const loadAppState = () => {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    return raw ? migrateLegacyState(JSON.parse(raw)) : defaultAppState();
  } catch {
    return defaultAppState();
  }
};

let appState = loadAppState();
const saveAppState = () => localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));

const getActiveLabels = () =>
  [...appState.priceLabels]
    .filter((label) => label.isActive)
    .sort((left, right) => left.labelName.localeCompare(right.labelName, "zh-Hant"));

const getAudioById = (id) => appState.audioRecords.find((record) => record.id === id) || null;
const getImageById = (id) => appState.imageRecords.find((record) => record.id === id) || null;
const getFileBlob = (id) => appState.fileBlobs.find((record) => record.id === id) || null;

const getHighlightedDates = () => {
  const dates = new Set();
  appState.audioRecords.forEach((record) => dates.add(record.recordDate));
  appState.imageRecords.forEach((record) => dates.add(record.recordDate));
  appState.detailedLabelRecords.forEach((record) => dates.add(record.recordDate));
  return dates;
};

const getLedgerDay = (date) => ({
  date,
  audioRecords: [...appState.audioRecords]
    .filter((record) => record.recordDate === date)
    .sort((left, right) => new Date(left.recordTime) - new Date(right.recordTime)),
  imageRecords: [...appState.imageRecords]
    .filter((record) => record.recordDate === date)
    .sort((left, right) => new Date(left.recordTime) - new Date(right.recordTime)),
  detailedLabels: [...appState.detailedLabelRecords]
    .filter((record) => record.recordDate === date)
    .sort((left, right) => new Date(left.recordTime) - new Date(right.recordTime))
});

const getDetailedRecordsInRange = (startDate, endDate) =>
  appState.detailedLabelRecords
    .filter((record) => (!startDate || record.recordDate >= startDate) && (!endDate || record.recordDate <= endDate))
    .sort((left, right) => new Date(left.recordTime) - new Date(right.recordTime));

const countLabelsBySource = (sourceType, sourceRecordId) =>
  appState.detailedLabelRecords.filter(
    (record) => record.sourceType === sourceType && record.sourceRecordId === sourceRecordId
  ).length;

const renderEmptyState = (title, description, actionHref, actionLabel) => `
  <div class="empty-state">
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(description)}</span>
    ${actionHref && actionLabel ? `<a class="btn btn-secondary" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>` : ""}
  </div>
`;

const showToast = (message) => {
  const node = document.querySelector("[data-toast]");
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    node.hidden = true;
    node.textContent = "";
  }, 2400);
};

const upsertPriceLabel = ({ id, labelName, amount }) => {
  const now = nowIso();
  const existing = appState.priceLabels.find((item) => item.id === id);
  if (existing) {
    existing.labelName = labelName;
    existing.amount = parseMoney(amount);
    existing.updatedAt = now;
  } else {
    appState.priceLabels.unshift({
      id: createId(),
      labelName,
      amount: parseMoney(amount),
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  }
  saveAppState();
};

const createAudioRecord = ({ sourceType, fileName, duration = 0, initialMarkers = [] }) => {
  const now = nowIso();
  const audioRecord = {
    id: createId(),
    sourceType,
    fileName,
    recordDate: now.slice(0, 10),
    recordTime: now,
    duration,
    localFileReference: "",
    initialMarkers: [],
    createdAt: now,
    updatedAt: now
  };
  audioRecord.initialMarkers = initialMarkers
    .map((marker) => ({
      id: createId(),
      audioRecordId: audioRecord.id,
      timestamp: Number(marker.timestamp) || 0,
      createdAt: now
    }))
    .sort((left, right) => left.timestamp - right.timestamp);
  appState.audioRecords.unshift(audioRecord);
  saveAppState();
  return audioRecord;
};

const addMarkerToAudioRecord = (audioRecordId, timestamp) => {
  const audioRecord = getAudioById(audioRecordId);
  if (!audioRecord) return null;
  const marker = {
    id: createId(),
    audioRecordId,
    timestamp: Math.max(0, Math.floor(Number(timestamp) || 0)),
    createdAt: nowIso()
  };
  audioRecord.initialMarkers.push(marker);
  audioRecord.initialMarkers.sort((left, right) => left.timestamp - right.timestamp);
  audioRecord.updatedAt = nowIso();
  saveAppState();
  return marker;
};

const createDetailedRecord = (payload) => {
  const now = nowIso();
  const detailRecord = {
    id: createId(),
    sourceType: payload.sourceType,
    sourceRecordId: payload.sourceRecordId,
    sourceFileName: payload.sourceFileName,
    recordDate: payload.recordDate,
    recordTime: payload.recordTime || now,
    audioTimestamp: payload.sourceType === "audio" ? Number(payload.audioTimestamp) || 0 : null,
    labelName: payload.labelName,
    amount: parseMoney(payload.amount),
    note: payload.note || "",
    createdAt: now,
    updatedAt: now
  };
  appState.detailedLabelRecords.unshift(detailRecord);
  saveAppState();
  return detailRecord;
};

const createImageRecordWithDetail = ({ fileName, mimeType, dataUrl, recordDate, recordTime, selectedLabel, note }) => {
  const now = nowIso();
  const blobId = createId();
  appState.fileBlobs.unshift({
    id: blobId,
    fileName,
    mimeType,
    dataUrl,
    createdAt: now
  });
  const imageRecord = {
    id: createId(),
    fileName,
    recordDate,
    recordTime,
    localFileReference: blobId,
    createdAt: now,
    updatedAt: now
  };
  appState.imageRecords.unshift(imageRecord);
  appState.detailedLabelRecords.unshift({
    id: createId(),
    sourceType: "image",
    sourceRecordId: imageRecord.id,
    sourceFileName: imageRecord.fileName,
    recordDate: imageRecord.recordDate,
    recordTime: imageRecord.recordTime,
    audioTimestamp: null,
    labelName: selectedLabel.labelName,
    amount: parseMoney(selectedLabel.amount),
    note: note || "",
    createdAt: now,
    updatedAt: now
  });
  saveAppState();
  return imageRecord;
};

const removeDetailedRecord = (id) => {
  appState.detailedLabelRecords = appState.detailedLabelRecords.filter((record) => record.id !== id);
  saveAppState();
};

const deleteImageRecordWithChildren = (imageRecordId) => {
  const imageRecord = getImageById(imageRecordId);
  if (!imageRecord) return;
  appState.imageRecords = appState.imageRecords.filter((record) => record.id !== imageRecordId);
  appState.detailedLabelRecords = appState.detailedLabelRecords.filter(
    (record) => !(record.sourceType === "image" && record.sourceRecordId === imageRecordId)
  );
  if (imageRecord.localFileReference) {
    appState.fileBlobs = appState.fileBlobs.filter((blob) => blob.id !== imageRecord.localFileReference);
  }
  saveAppState();
};

const renderHomeSummary = () => {
  const node = document.querySelector("[data-home-stats]");
  if (!node) return;
  const totalAmount = appState.detailedLabelRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const cards = [
    ["啟用中的價格標籤", String(getActiveLabels().length), "沒有系統預設項目，全部由你手動建立。"],
    ["音訊紀錄", String(appState.audioRecords.length), "只算已建立的音檔來源。"],
    ["影像紀錄", String(appState.imageRecords.length), "照片與截圖會在同一份台帳裡。"],
    ["可結帳正式標籤", String(appState.detailedLabelRecords.length), `目前累積 ${formatCurrency(totalAmount)}。`]
  ];
  node.innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card">
          <span class="kpi-label">${escapeHtml(label)}</span>
          <strong class="kpi-value">${escapeHtml(value)}</strong>
          <span class="stat-note">${escapeHtml(note)}</span>
        </article>
      `
    )
    .join("");
};

const renderLauncherStats = () => {
  const node = document.querySelector("[data-launcher-stats]");
  if (!node) return;
  const days = new Set(appState.detailedLabelRecords.map((record) => record.recordDate)).size;
  const cards = [
    ["已覆蓋頁面", "7", "首頁、錄音、影像、台帳、結帳、設定、入口"],
    ["已記錄日期", String(days), "日曆高亮會直接由本機資料決定。"],
    ["正式標籤數", String(appState.detailedLabelRecords.length), "結帳只看 DetailedLabelRecord。"],
    ["本機資料模式", "100%", "不登入、不上雲、不做 AI 自動辨識。"]
  ];
  node.innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="kpi-card">
          <span class="kpi-label">${escapeHtml(label)}</span>
          <strong class="kpi-value">${escapeHtml(value)}</strong>
          <span class="stat-note">${escapeHtml(note)}</span>
        </article>
      `
    )
    .join("");
};

const initNav = () => {
  const toggle = document.querySelector("[data-nav-toggle]");
  const links = document.querySelector("[data-nav-links]");
  if (!toggle || !links) return;
  const ui = readUiState();
  if (ui.navOpen) links.classList.add("is-open");
  toggle.addEventListener("click", () => {
    links.classList.toggle("is-open");
    writeUiState({ navOpen: links.classList.contains("is-open") });
  });
};

const initRecordingPage = () => {
  const page = document.querySelector("[data-recording-page]");
  if (!page) return;

  const state = {
    mode: "record",
    selectedAudioId: appState.audioRecords[0]?.id || null,
    isRecording: false,
    recordSeconds: 0,
    recordTimer: null,
    draftMarkers: [],
    currentPlaybackSeconds: 0,
    uploadPlaying: false
  };

  const recordPanel = document.querySelector("[data-record-panel]");
  const uploadPanel = document.querySelector("[data-upload-panel]");
  const timerNode = document.querySelector("[data-record-timer]");
  const meterNode = document.querySelector("[data-meter]");
  const statusNode = document.querySelector("[data-record-status]");
  const markerListNode = document.querySelector("[data-marker-list]");
  const labelListNode = document.querySelector("[data-label-list]");
  const detailListNode = document.querySelector("[data-detail-list]");
  const trackInput = document.querySelector("[data-track-input]");
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  const getSelectedAudio = () => getAudioById(state.selectedAudioId);

  const syncMode = () => {
    modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === state.mode));
    recordPanel.hidden = state.mode !== "record";
    uploadPanel.hidden = state.mode !== "upload";
  };

  const syncMeter = () => {
    const width = state.isRecording ? 18 + ((state.recordSeconds * 7) % 72) : 12;
    meterNode?.style.setProperty("--meter-width", `${width}%`);
  };

  const syncTimer = () => {
    if (timerNode) timerNode.textContent = formatDuration(state.recordSeconds);
    syncMeter();
  };

  const ensureUploadAudio = () => {
    let audioRecord = appState.audioRecords.find((record) => record.sourceType === "uploaded_audio");
    if (!audioRecord) {
      audioRecord = createAudioRecord({
        sourceType: "uploaded_audio",
        fileName: "匯入音檔示意.m4a",
        duration: 600
      });
    }
    state.selectedAudioId = audioRecord.id;
    return audioRecord;
  };

  const renderMarkers = () => {
    const markers = getSelectedAudio()?.initialMarkers || [];
    if (!markers.length) {
      markerListNode.innerHTML = renderEmptyState(
        "這個音檔尚未建立初步標記。",
        "你仍然可以播放音檔，並在任意時間點建立細部標籤。",
        "",
        ""
      );
      return;
    }
    markerListNode.innerHTML = markers
      .map(
        (marker, index) => `
          <button type="button" class="marker-pill" data-marker-jump="${marker.id}">
            第 ${index + 1} 個 · ${formatDuration(marker.timestamp)}
          </button>
        `
      )
      .join("");
    markerListNode.querySelectorAll("[data-marker-jump]").forEach((button) => {
      button.addEventListener("click", () => {
        const marker = markers.find((item) => item.id === button.dataset.markerJump);
        if (!marker) return;
        state.currentPlaybackSeconds = marker.timestamp;
        if (trackInput) trackInput.value = String(marker.timestamp);
        showToast(`已跳到 ${formatDuration(marker.timestamp)}`);
      });
    });
  };

  const renderLabels = () => {
    const labels = getActiveLabels();
    if (!labels.length) {
      labelListNode.innerHTML = renderEmptyState(
        "你尚未建立價格項目。",
        "請先到設定頁新增細部標籤後，再開始標記。",
        "settings.html",
        "前往設定"
      );
      return;
    }
    labelListNode.innerHTML = labels
      .map(
        (label) => `
          <button type="button" class="chip-button" data-create-detail="${label.id}">
            <span>${escapeHtml(label.labelName)}</span>
            <strong>${escapeHtml(formatCurrency(label.amount))}</strong>
          </button>
        `
      )
      .join("");
    labelListNode.querySelectorAll("[data-create-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        let audioRecord = getSelectedAudio();
        if (!audioRecord) {
          audioRecord = createAudioRecord({
            sourceType: state.mode === "record" ? "recorded_audio" : "uploaded_audio",
            fileName: state.mode === "record" ? "未命名錄音.webm" : "匯入音檔示意.m4a",
            duration: Math.max(state.recordSeconds, state.currentPlaybackSeconds, 120),
            initialMarkers: state.draftMarkers
          });
          state.selectedAudioId = audioRecord.id;
          state.draftMarkers = [];
        }
        const label = labels.find((item) => item.id === button.dataset.createDetail);
        if (!label) {
          showToast("此價格項目已不存在或已停用，請重新選擇。");
          renderLabels();
          return;
        }
        const detailRecord = createDetailedRecord({
          sourceType: "audio",
          sourceRecordId: audioRecord.id,
          sourceFileName: audioRecord.fileName,
          recordDate: audioRecord.recordDate,
          recordTime: nowIso(),
          audioTimestamp: state.mode === "record" ? state.recordSeconds : state.currentPlaybackSeconds,
          labelName: label.labelName,
          amount: label.amount
        });
        showToast(`已新增標籤：${label.labelName} ${formatCurrency(label.amount)}`);
        renderDetailList(detailRecord.id);
        renderHomeSummary();
        renderLauncherStats();
      });
    });
  };

  const renderDetailList = (focusId = "") => {
    const records = appState.detailedLabelRecords
      .filter((record) => record.sourceType === "audio")
      .sort((left, right) => new Date(right.recordTime) - new Date(left.recordTime));
    if (!records.length) {
      detailListNode.innerHTML = renderEmptyState(
        "尚未建立音訊細部標籤。",
        "請播放音檔後按下價格標籤，建立第一筆正式可結帳紀錄。",
        "",
        ""
      );
      return;
    }
    detailListNode.innerHTML = records
      .map(
        (record) => `
          <article class="detail-item ${focusId === record.id ? "is-highlight" : ""}">
            <div class="record-head">
              <div>
                <div class="detail-title">${escapeHtml(record.labelName)} · ${escapeHtml(formatCurrency(record.amount))}</div>
                <div class="detail-label">音訊｜${escapeHtml(record.sourceFileName)}｜${escapeHtml(formatDuration(record.audioTimestamp || 0))}</div>
              </div>
              <span class="pill neutral-pill">${escapeHtml(formatDateTime(record.recordTime))}</span>
            </div>
            <div class="detail-actions">
              <button type="button" class="btn btn-secondary" data-jump-detail="${record.id}">跳到時間</button>
              <button type="button" class="btn btn-secondary detail-note-toggle" data-toggle-note="${record.id}">編輯備註</button>
              <button type="button" class="btn btn-ghost" data-delete-detail="${record.id}">刪除</button>
            </div>
            <form class="detail-note ${record.note ? "is-open" : ""}" data-note-form="${record.id}">
              <label class="field">
                <span>備註，可選填</span>
                <textarea class="textarea" name="note">${escapeHtml(record.note || "")}</textarea>
              </label>
              <div class="detail-actions">
                <button type="submit" class="btn btn-primary">儲存備註</button>
              </div>
            </form>
          </article>
        `
      )
      .join("");

    detailListNode.querySelectorAll("[data-jump-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        const record = appState.detailedLabelRecords.find((item) => item.id === button.dataset.jumpDetail);
        if (!record) return;
        state.selectedAudioId = record.sourceRecordId;
        state.currentPlaybackSeconds = record.audioTimestamp || 0;
        if (trackInput) trackInput.value = String(state.currentPlaybackSeconds);
        renderMarkers();
        showToast(`已跳到 ${formatDuration(state.currentPlaybackSeconds)}`);
      });
    });

    detailListNode.querySelectorAll("[data-toggle-note]").forEach((button) => {
      button.addEventListener("click", () => {
        const form = detailListNode.querySelector(`[data-note-form="${button.dataset.toggleNote}"]`);
        form?.classList.toggle("is-open");
      });
    });

    detailListNode.querySelectorAll("[data-delete-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!window.confirm("確定要刪除這筆標籤紀錄嗎？這不會刪除原始音檔。")) return;
        removeDetailedRecord(button.dataset.deleteDetail);
        renderDetailList();
        renderHomeSummary();
        renderLauncherStats();
        showToast("已刪除細部標籤。");
      });
    });

    detailListNode.querySelectorAll("[data-note-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const record = appState.detailedLabelRecords.find((item) => item.id === form.dataset.noteForm);
        if (!record) return;
        const noteField = form.elements.namedItem("note");
        record.note = String(noteField?.value || "").trim();
        record.updatedAt = nowIso();
        saveAppState();
        showToast("備註已更新。");
      });
    });
  };

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      syncMode();
      if (state.mode === "upload") ensureUploadAudio();
      renderMarkers();
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "start" && !state.isRecording) {
        state.isRecording = true;
        statusNode.textContent = "錄音中。現在按「標記這一刻」只記時間點，不決定標籤名稱。";
        state.recordTimer = window.setInterval(() => {
          state.recordSeconds += 1;
          syncTimer();
        }, 1000);
      }
      if (action === "pause" && state.isRecording) {
        window.clearInterval(state.recordTimer);
        state.isRecording = false;
        statusNode.textContent = "錄音已暫停。你可以恢復，或先停留在這裡整理。";
        syncMeter();
      }
      if (action === "resume" && !state.isRecording && state.recordSeconds > 0) {
        state.isRecording = true;
        statusNode.textContent = "錄音已恢復。";
        state.recordTimer = window.setInterval(() => {
          state.recordSeconds += 1;
          syncTimer();
        }, 1000);
      }
      if (action === "stop") {
        window.clearInterval(state.recordTimer);
        state.isRecording = false;
        if (!state.recordSeconds && !state.draftMarkers.length) {
          statusNode.textContent = "尚未錄到內容。可以直接上傳音檔，或重新開始錄音。";
          return;
        }
        const audioRecord = createAudioRecord({
          sourceType: "recorded_audio",
          fileName: `現場錄音_${new Date().toISOString().slice(0, 16).replaceAll(":", "-")}.webm`,
          duration: Math.max(state.recordSeconds, 1),
          initialMarkers: state.draftMarkers
        });
        state.selectedAudioId = audioRecord.id;
        state.draftMarkers = [];
        statusNode.textContent = "錄音已暫存到本機資料結構。下一步可以直接套用詳細標籤。";
        renderMarkers();
        renderHomeSummary();
        renderLauncherStats();
        showToast("錄音紀錄已暫存。");
      }
      if (action === "mark") {
        if (state.mode === "record") {
          if (state.selectedAudioId && !state.isRecording) {
            addMarkerToAudioRecord(state.selectedAudioId, state.recordSeconds);
          } else {
            state.draftMarkers.push({ timestamp: state.recordSeconds });
            state.draftMarkers.sort((left, right) => left.timestamp - right.timestamp);
          }
          showToast(`已標記 ${formatDuration(state.recordSeconds)}`);
          if (state.selectedAudioId) renderMarkers();
          return;
        }
        const audioRecord = ensureUploadAudio();
        addMarkerToAudioRecord(audioRecord.id, Number(trackInput?.value || 0));
        renderMarkers();
        renderHomeSummary();
        renderLauncherStats();
        showToast(`已標記 ${formatDuration(Number(trackInput?.value || 0))}`);
      }
    });
  });

  trackInput?.addEventListener("input", () => {
    state.currentPlaybackSeconds = Number(trackInput.value || 0);
  });

  const uploadButton = document.querySelector("[data-upload-play]");
  uploadButton?.addEventListener("click", () => {
    ensureUploadAudio();
    state.uploadPlaying = !state.uploadPlaying;
    uploadButton.textContent = state.uploadPlaying ? "暫停音檔" : "播放音檔";
    showToast(state.uploadPlaying ? "播放示意已開始。" : "播放示意已暫停。");
  });

  syncMode();
  syncTimer();
  renderMarkers();
  renderLabels();
  renderDetailList();
};

const initCheckoutPage = () => {
  const page = document.querySelector("[data-checkout-page]");
  if (!page) return;

  const startInput = document.querySelector("[data-start-date]");
  const endInput = document.querySelector("[data-end-date]");
  const summaryNode = document.querySelector("[data-summary]");
  const receiptNode = document.querySelector("[data-receipt-preview]");
  const reportNode = document.querySelector("[data-report-preview]");
  const tabs = [...document.querySelectorAll("[data-preview-tab]")];

  const dates = [...new Set(appState.detailedLabelRecords.map((record) => record.recordDate))].sort();
  const fallbackDate = new Date().toISOString().slice(0, 10);
  startInput.value = dates[0] || fallbackDate;
  endInput.value = dates[dates.length - 1] || fallbackDate;

  const toggleTab = (name) => {
    tabs.forEach((button) => button.classList.toggle("is-active", button.dataset.previewTab === name));
    document.querySelectorAll("[data-preview-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.previewPanel !== name;
    });
  };

  const render = () => {
    const records = getDetailedRecordsInRange(startInput.value, endInput.value);
    const grouped = new Map();
    records.forEach((record) => {
      const key = `${record.labelName}__${record.amount}`;
      if (!grouped.has(key)) {
        grouped.set(key, { labelName: record.labelName, amount: Number(record.amount), quantity: 0, subtotal: 0 });
      }
      const entry = grouped.get(key);
      entry.quantity += 1;
      entry.subtotal += Number(record.amount);
    });

    const groups = [...grouped.values()].sort((left, right) => right.subtotal - left.subtotal);
    const grandTotal = records.reduce((sum, record) => sum + Number(record.amount), 0);
    const dateCount = new Set(records.map((record) => record.recordDate)).size;
    const audioCount = records.filter((record) => record.sourceType === "audio").length;
    const imageCount = records.filter((record) => record.sourceType === "image").length;
    const topCategory = groups[0]?.labelName || "—";

    summaryNode.innerHTML = [
      ["涵蓋天數", String(dateCount), "有正式細部標籤的日期數"],
      ["音訊筆數", String(audioCount), "只計入可結帳的音訊正式標籤"],
      ["影像筆數", String(imageCount), "影像標籤與音訊標籤會一起統計"],
      ["區間總額", formatCurrency(grandTotal), `目前最高分類：${topCategory}`]
    ]
      .map(
        ([label, value, note]) => `
          <article class="summary-card">
            <span class="kpi-label">${escapeHtml(label)}</span>
            <strong class="kpi-value">${escapeHtml(value)}</strong>
            <span class="stat-note">${escapeHtml(note)}</span>
          </article>
        `
      )
      .join("");

    if (!records.length) {
      const emptyMarkup = renderEmptyState(
        "此時間區間內沒有可結帳的細部標籤紀錄。",
        "請先到對話對帳單或新增影像紀錄中建立標籤。",
        "ledger.html",
        "前往對帳單"
      );
      receiptNode.innerHTML = emptyMarkup;
      reportNode.innerHTML = emptyMarkup;
      return;
    }

    receiptNode.innerHTML = `
      <div class="receipt-head">
        <strong class="detail-title">髒話收銀機｜結帳收據</strong>
        <span class="detail-label">${escapeHtml(startInput.value)} 至 ${escapeHtml(endInput.value)} · 產生時間 ${escapeHtml(formatDateTime(nowIso()))}</span>
      </div>
      <div class="receipt-body">
        ${groups
          .map(
            (group) => `
              <article class="receipt-block">
                <div class="receipt-row">
                  <strong>${escapeHtml(group.labelName)}</strong>
                  <span>${escapeHtml(formatCurrency(group.amount))}</span>
                </div>
                <div class="receipt-row">
                  <span class="detail-label">數量 ${group.quantity}</span>
                  <strong>${escapeHtml(formatCurrency(group.subtotal))}</strong>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="receipt-foot">
        <div class="receipt-row">
          <span class="entry-title">總額</span>
          <strong class="entry-title">${escapeHtml(formatCurrency(grandTotal))}</strong>
        </div>
      </div>
    `;

    reportNode.innerHTML = `
      <div class="report-stack">
        <article class="report-block">
          <strong class="detail-title">職場事件紀錄明細</strong>
          <div class="detail-label">${escapeHtml(startInput.value)} 至 ${escapeHtml(endInput.value)} · 產生時間 ${escapeHtml(formatDateTime(nowIso()))}</div>
          <div class="entry-desc">本報告由使用者手動建立標籤與備註，僅作個人紀錄整理用途。本工具不提供法律意見，也不判斷職場霸凌或任何違法事實是否成立。</div>
        </article>
        <div class="report-table">
          <div class="table-row is-head">
            <span>日期</span><span>時間</span><span>來源</span><span>檔案名稱</span><span>音訊時間戳</span><span>標籤</span><span>金額 / 備註</span>
          </div>
          ${records
            .map(
              (record) => `
                <div class="table-row">
                  <span>${escapeHtml(formatDate(record.recordDate))}</span>
                  <span>${escapeHtml(formatTimeOnly(record.recordTime))}</span>
                  <span>${record.sourceType === "audio" ? "音訊" : "影像"}</span>
                  <span>${escapeHtml(record.sourceFileName)}</span>
                  <span>${record.audioTimestamp != null ? escapeHtml(formatDuration(record.audioTimestamp)) : "—"}</span>
                  <span>${escapeHtml(record.labelName)}</span>
                  <span>${escapeHtml(formatCurrency(record.amount))}<br>${escapeHtml(record.note || "—")}</span>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="report-cards">
          ${records
            .map(
              (record) => `
                <article class="report-card">
                  <div class="report-card-meta">
                    <span class="pill neutral-pill">${record.sourceType === "audio" ? "音訊" : "影像"}</span>
                    <span class="detail-label">${escapeHtml(formatDate(record.recordDate))} ${escapeHtml(formatTimeOnly(record.recordTime))}</span>
                  </div>
                  <strong class="detail-title">${escapeHtml(record.labelName)} · ${escapeHtml(formatCurrency(record.amount))}</strong>
                  <div class="report-card-grid">
                    <span>檔案名稱<strong>${escapeHtml(record.sourceFileName)}</strong></span>
                    <span>音訊時間戳<strong>${record.audioTimestamp != null ? escapeHtml(formatDuration(record.audioTimestamp)) : "—"}</strong></span>
                    <span>備註<strong>${escapeHtml(record.note || "—")}</strong></span>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  };

  tabs.forEach((button) => button.addEventListener("click", () => toggleTab(button.dataset.previewTab)));
  document.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleTab(button.dataset.export === "receipt" ? "receipt" : "report");
      showToast("這一版先固定匯出位置與預覽，不直接產生 PDF。");
    });
  });
  startInput.addEventListener("change", render);
  endInput.addEventListener("change", render);
  toggleTab("receipt");
  render();
};

const initSettingsPage = () => {
  const page = document.querySelector("[data-settings-page]");
  if (!page) return;

  const form = document.querySelector("[data-price-form]");
  const labelNameInput = form.elements.namedItem("labelName");
  const amountInput = form.elements.namedItem("amount");
  const listNode = document.querySelector("[data-price-list]");
  const warningNode = document.querySelector("[data-price-warning]");
  let editingId = null;

  const resetForm = () => {
    editingId = null;
    form.reset();
    form.querySelector("[data-submit-label]").textContent = "新增";
  };

  const render = () => {
    const labels = [...appState.priceLabels].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
    if (!labels.length) {
      listNode.innerHTML = renderEmptyState(
        "尚未建立價格項目。",
        "請先新增至少一個細部標籤，才能開始標記對話或照片。",
        "",
        ""
      );
      return;
    }
    listNode.innerHTML = labels
      .map(
        (label) => `
          <article class="price-item">
            <div class="record-head">
              <div>
                <div class="detail-title">${escapeHtml(label.labelName)}</div>
                <div class="detail-label">${escapeHtml(formatCurrency(label.amount))} · ${label.isActive ? "啟用中" : "已停用"}</div>
              </div>
              <span class="pill ${label.isActive ? "" : "neutral-pill"}">${label.isActive ? "可套用" : "不顯示在標籤區"}</span>
            </div>
            <div class="detail-actions">
              <button type="button" class="btn btn-secondary" data-edit-label="${label.id}">編輯</button>
              <button type="button" class="btn btn-secondary" data-toggle-label="${label.id}">${label.isActive ? "停用" : "啟用"}</button>
              <button type="button" class="btn btn-ghost" data-delete-label="${label.id}">刪除</button>
            </div>
          </article>
        `
      )
      .join("");

    listNode.querySelectorAll("[data-edit-label]").forEach((button) => {
      button.addEventListener("click", () => {
        const label = appState.priceLabels.find((item) => item.id === button.dataset.editLabel);
        if (!label) return;
        editingId = label.id;
        labelNameInput.value = label.labelName;
        amountInput.value = String(label.amount);
        form.querySelector("[data-submit-label]").textContent = "儲存修改";
      });
    });

    listNode.querySelectorAll("[data-toggle-label]").forEach((button) => {
      button.addEventListener("click", () => {
        const label = appState.priceLabels.find((item) => item.id === button.dataset.toggleLabel);
        if (!label) return;
        label.isActive = !label.isActive;
        label.updatedAt = nowIso();
        saveAppState();
        render();
        renderHomeSummary();
        showToast(label.isActive ? "價格項目已重新啟用。" : "價格項目已停用。");
      });
    });

    listNode.querySelectorAll("[data-delete-label]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!window.confirm("確定要刪除這個價格項目嗎？已建立的歷史標籤紀錄不會被刪除。")) return;
        appState.priceLabels = appState.priceLabels.filter((item) => item.id !== button.dataset.deleteLabel);
        saveAppState();
        render();
        renderHomeSummary();
        showToast("價格項目已刪除。");
      });
    });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const labelName = String(labelNameInput?.value || "").trim();
    const amount = String(amountInput?.value || "").trim();
    warningNode.textContent = "";
    if (!labelName) return (warningNode.textContent = "標籤名稱不可空白。");
    if (amount === "") return (warningNode.textContent = "金額不可空白。");
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      warningNode.textContent = "金額必須為 0 或正數，且最多只到小數點後 2 位。";
      return;
    }
    const duplicate = appState.priceLabels.find((item) => item.id !== editingId && item.labelName.trim() === labelName);
    if (duplicate) warningNode.textContent = "提醒：已有同名標籤，雖然允許建立，但之後可能造成混淆。";
    upsertPriceLabel({ id: editingId, labelName, amount });
    const wasEditing = Boolean(editingId);
    resetForm();
    render();
    renderHomeSummary();
    showToast(wasEditing ? "價格項目已更新。" : "價格項目已新增。");
  });

  render();
};

const initLedgerPage = () => {
  const page = document.querySelector("[data-ledger-page]");
  if (!page) return;

  const monthLabel = document.querySelector("[data-calendar-month]");
  const calendarNode = document.querySelector("[data-calendar-grid]");
  const summaryNode = document.querySelector("[data-day-summary]");
  const audioListNode = document.querySelector("[data-ledger-audio-list]");
  const imageListNode = document.querySelector("[data-ledger-image-list]");
  const detailListNode = document.querySelector("[data-ledger-detail-list]");
  const labelNode = document.querySelector("[data-ledger-labels]");
  const markerNode = document.querySelector("[data-ledger-markers]");
  const playerStatusNode = document.querySelector("[data-ledger-player-status]");
  const playerScrubber = document.querySelector("[data-ledger-scrubber]");
  const prevButton = document.querySelector("[data-marker-prev]");
  const nextButton = document.querySelector("[data-marker-next]");

  const params = new URLSearchParams(window.location.search);
  let selectedDate = params.get("date") || new Date().toISOString().slice(0, 10);
  let selectedAudioId = null;
  let currentMarkerIndex = 0;

  const countRecordsOnDate = (dateValue) => {
    const day = getLedgerDay(dateValue);
    return day.audioRecords.length + day.imageRecords.length + day.detailedLabels.length;
  };

  const persistSelectedDate = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", selectedDate);
    window.history.replaceState({}, "", url.toString());
  };

  const renderCalendar = () => {
    const current = new Date(`${selectedDate}T00:00:00`);
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const leading = firstDay.getDay();
    const total = lastDay.getDate();
    const highlighted = getHighlightedDates();
    monthLabel.textContent = `${year} 年 ${month + 1} 月`;

    const cells = [];
    for (let index = 0; index < leading; index += 1) cells.push(`<div class="calendar-cell is-blank"></div>`);
    for (let day = 1; day <= total; day += 1) {
      const dateValue = new Date(year, month, day).toISOString().slice(0, 10);
      const hasData = highlighted.has(dateValue);
      const isSelected = dateValue === selectedDate;
      const isToday = dateValue === new Date().toISOString().slice(0, 10);
      cells.push(`
        <button type="button" class="calendar-cell ${hasData ? "has-data" : ""} ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}" data-date-cell="${dateValue}">
          <span>${day}</span>
          ${hasData ? `<small>${countRecordsOnDate(dateValue)} 筆</small>` : ""}
        </button>
      `);
    }
    calendarNode.innerHTML = cells.join("");
    calendarNode.querySelectorAll("[data-date-cell]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedDate = button.dataset.dateCell;
        persistSelectedDate();
        render();
      });
    });
  };

  const renderSummary = (day) => {
    const total = day.detailedLabels.reduce((sum, record) => sum + Number(record.amount), 0);
    summaryNode.innerHTML = `
      <article class="summary-card">
        <span class="kpi-label">日期</span>
        <strong class="kpi-value">${escapeHtml(formatDate(day.date))}</strong>
        <span class="stat-note">音訊 ${day.audioRecords.length} 筆｜影像 ${day.imageRecords.length} 筆</span>
      </article>
      <article class="summary-card">
        <span class="kpi-label">正式標籤</span>
        <strong class="kpi-value">${day.detailedLabels.length}</strong>
        <span class="stat-note">只有正式標籤會進入結帳。</span>
      </article>
      <article class="summary-card">
        <span class="kpi-label">當日小計</span>
        <strong class="kpi-value">${escapeHtml(formatCurrency(total))}</strong>
        <span class="stat-note">來自 audio + image 的 DetailedLabelRecord。</span>
      </article>
    `;
  };

  const renderAudioList = (day) => {
    if (!day.audioRecords.length) {
      audioListNode.innerHTML = renderEmptyState("這一天沒有音訊紀錄。", "你可以先錄音或上傳音檔。", "recording.html", "前往對話錄音");
      selectedAudioId = null;
      return;
    }
    selectedAudioId = selectedAudioId && day.audioRecords.some((item) => item.id === selectedAudioId) ? selectedAudioId : day.audioRecords[0].id;
    audioListNode.innerHTML = day.audioRecords
      .map(
        (record) => `
          <button type="button" class="day-card ${record.id === selectedAudioId ? "is-selected" : ""}" data-audio-select="${record.id}">
            <div class="record-head">
              <div>
                <div class="detail-title">${escapeHtml(record.fileName)}</div>
                <div class="detail-label">${escapeHtml(formatTimeOnly(record.recordTime))} · 初步標記 ${record.initialMarkers.length} · 細部標籤 ${countLabelsBySource("audio", record.id)}</div>
              </div>
              <span class="pill neutral-pill">${record.sourceType === "recorded_audio" ? "錄音" : "上傳"}</span>
            </div>
          </button>
        `
      )
      .join("");
    audioListNode.querySelectorAll("[data-audio-select]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedAudioId = button.dataset.audioSelect;
        currentMarkerIndex = 0;
        render();
      });
    });
  };

  const renderLabels = () => {
    const labels = getActiveLabels();
    if (!labels.length) {
      labelNode.innerHTML = renderEmptyState("你尚未建立價格項目。", "請先到設定頁新增細部標籤後，再開始標記。", "settings.html", "前往設定");
      return;
    }
    labelNode.innerHTML = labels
      .map((label) => `<button type="button" class="chip-button" data-ledger-label="${label.id}"><span>${escapeHtml(label.labelName)}</span><strong>${escapeHtml(formatCurrency(label.amount))}</strong></button>`)
      .join("");
    labelNode.querySelectorAll("[data-ledger-label]").forEach((button) => {
      button.addEventListener("click", () => {
        const audioRecord = getAudioById(selectedAudioId);
        const label = labels.find((item) => item.id === button.dataset.ledgerLabel);
        if (!audioRecord || !label) return;
        createDetailedRecord({
          sourceType: "audio",
          sourceRecordId: audioRecord.id,
          sourceFileName: audioRecord.fileName,
          recordDate: audioRecord.recordDate,
          recordTime: nowIso(),
          audioTimestamp: Number(playerScrubber.value || 0),
          labelName: label.labelName,
          amount: label.amount
        });
        showToast(`已新增標籤：${label.labelName} ${formatCurrency(label.amount)}`);
        render();
      });
    });
  };

  const renderMarkerNav = () => {
    const audioRecord = getAudioById(selectedAudioId);
    if (!audioRecord || !audioRecord.initialMarkers.length) {
      markerNode.innerHTML = renderEmptyState("這個音檔尚未建立初步標記。", "你仍然可以播放音檔，並在任意時間點建立細部標籤。", "", "");
      prevButton.disabled = true;
      nextButton.disabled = true;
      playerStatusNode.textContent = "尚未選到可跳轉的初步標記。";
      return;
    }

    const markers = [...audioRecord.initialMarkers].sort((left, right) => left.timestamp - right.timestamp);
    currentMarkerIndex = Math.min(currentMarkerIndex, markers.length - 1);
    prevButton.disabled = currentMarkerIndex <= 0;
    nextButton.disabled = currentMarkerIndex >= markers.length - 1;
    playerStatusNode.textContent = `初步標記：第 ${currentMarkerIndex + 1} 個 / 共 ${markers.length} 個`;
    markerNode.innerHTML = markers
      .map((marker, index) => `<button type="button" class="marker-pill ${index === currentMarkerIndex ? "is-current" : ""}" data-ledger-marker="${index}">${escapeHtml(formatDuration(marker.timestamp))}</button>`)
      .join("");
    markerNode.querySelectorAll("[data-ledger-marker]").forEach((button) => {
      button.addEventListener("click", () => {
        currentMarkerIndex = Number(button.dataset.ledgerMarker);
        playerScrubber.value = String(markers[currentMarkerIndex].timestamp);
        renderMarkerNav();
      });
    });
  };

  prevButton.addEventListener("click", () => {
    const audioRecord = getAudioById(selectedAudioId);
    if (!audioRecord) return;
    currentMarkerIndex = Math.max(0, currentMarkerIndex - 1);
    playerScrubber.value = String(audioRecord.initialMarkers[currentMarkerIndex]?.timestamp || 0);
    renderMarkerNav();
  });

  nextButton.addEventListener("click", () => {
    const audioRecord = getAudioById(selectedAudioId);
    if (!audioRecord) return;
    currentMarkerIndex = Math.min(audioRecord.initialMarkers.length - 1, currentMarkerIndex + 1);
    playerScrubber.value = String(audioRecord.initialMarkers[currentMarkerIndex]?.timestamp || 0);
    renderMarkerNav();
  });

  const renderImageList = (day) => {
    if (!day.imageRecords.length) {
      imageListNode.innerHTML = renderEmptyState("尚未建立影像紀錄。", "你可以新增照片或截圖作為補充紀錄。", "image-new.html", "新增影像紀錄");
      return;
    }
    imageListNode.innerHTML = day.imageRecords
      .map((record) => {
        const blob = getFileBlob(record.localFileReference);
        return `
          <article class="day-card">
            ${blob?.dataUrl ? `<img class="image-thumb" src="${blob.dataUrl}" alt="${escapeHtml(record.fileName)}">` : `<div class="image-thumb image-thumb--missing">影像遺失</div>`}
            <div class="record-head">
              <div>
                <div class="detail-title">${escapeHtml(record.fileName)}</div>
                <div class="detail-label">${escapeHtml(formatTimeOnly(record.recordTime))} · 已套用標籤 ${countLabelsBySource("image", record.id)}</div>
              </div>
              <span class="pill neutral-pill">影像</span>
            </div>
            <div class="detail-actions">
              ${blob?.dataUrl ? `<button type="button" class="btn btn-secondary" data-view-image="${record.id}">查看影像</button>` : `<span class="note">影像無法載入。可能是瀏覽器資料已被清除，但既有標籤與備註仍可查看。</span>`}
              <button type="button" class="btn btn-ghost" data-delete-image="${record.id}">刪除影像紀錄</button>
            </div>
          </article>
        `;
      })
      .join("");
    imageListNode.querySelectorAll("[data-view-image]").forEach((button) => {
      button.addEventListener("click", () => {
        const record = getImageById(button.dataset.viewImage);
        const blob = record ? getFileBlob(record.localFileReference) : null;
        if (!blob?.dataUrl) return showToast("影像無法載入。可能是瀏覽器資料已被清除，但既有標籤與備註仍可查看。");
        window.open(blob.dataUrl, "_blank", "noopener");
      });
    });
    imageListNode.querySelectorAll("[data-delete-image]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!window.confirm("確定要刪除這張影像紀錄嗎？這也會刪除與此影像相關的細部標籤紀錄。")) return;
        deleteImageRecordWithChildren(button.dataset.deleteImage);
        render();
        showToast("影像紀錄與相關細部標籤已刪除。");
      });
    });
  };

  const renderDetailList = (day) => {
    if (!day.detailedLabels.length) {
      detailListNode.innerHTML = renderEmptyState("這一天尚未建立細部標籤。", "請播放音檔或新增影像紀錄後，套用價格標籤。", "", "");
      return;
    }
    detailListNode.innerHTML = day.detailedLabels
      .map(
        (record) => `
          <article class="detail-item">
            <div class="record-head">
              <div>
                <div class="detail-title">${record.sourceType === "audio" ? "音訊" : "影像"}｜${escapeHtml(record.labelName)}｜${escapeHtml(formatCurrency(record.amount))}</div>
                <div class="detail-label">${escapeHtml(record.sourceFileName)} · ${escapeHtml(formatDateTime(record.recordTime))}${record.audioTimestamp != null ? ` · ${escapeHtml(formatDuration(record.audioTimestamp))}` : ""}</div>
              </div>
              <span class="pill neutral-pill">${record.sourceType === "audio" ? "可回跳" : "影像備註"}</span>
            </div>
            <div class="entry-desc">備註：${escapeHtml(record.note || "—")}</div>
            <div class="detail-actions">
              ${record.sourceType === "audio" ? `<button type="button" class="btn btn-secondary" data-jump-audio="${record.id}">跳到時間</button>` : ""}
              <button type="button" class="btn btn-secondary" data-edit-note="${record.id}">編輯備註</button>
              <button type="button" class="btn btn-ghost" data-delete-detail="${record.id}">刪除</button>
            </div>
          </article>
        `
      )
      .join("");
    detailListNode.querySelectorAll("[data-jump-audio]").forEach((button) => {
      button.addEventListener("click", () => {
        const record = appState.detailedLabelRecords.find((item) => item.id === button.dataset.jumpAudio);
        if (!record) return;
        selectedAudioId = record.sourceRecordId;
        playerScrubber.value = String(record.audioTimestamp || 0);
        render();
        showToast(`已切換到 ${record.sourceFileName} 的 ${formatDuration(record.audioTimestamp || 0)}`);
      });
    });
    detailListNode.querySelectorAll("[data-edit-note]").forEach((button) => {
      button.addEventListener("click", () => {
        const record = appState.detailedLabelRecords.find((item) => item.id === button.dataset.editNote);
        if (!record) return;
        const note = window.prompt("編輯備註", record.note || "");
        if (note == null) return;
        record.note = note.trim();
        record.updatedAt = nowIso();
        saveAppState();
        render();
        showToast("備註已更新。");
      });
    });
    detailListNode.querySelectorAll("[data-delete-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!window.confirm("確定要刪除這筆標籤紀錄嗎？這不會刪除原始音檔或照片。")) return;
        removeDetailedRecord(button.dataset.deleteDetail);
        render();
        showToast("細部標籤已刪除。");
      });
    });
  };

  const render = () => {
    const day = getLedgerDay(selectedDate);
    renderCalendar();
    renderSummary(day);
    renderAudioList(day);
    renderLabels();
    renderMarkerNav();
    renderImageList(day);
    renderDetailList(day);
    renderHomeSummary();
    renderLauncherStats();
  };

  playerScrubber.addEventListener("input", () => {
    playerStatusNode.textContent = `目前播放器時間：${formatDuration(Number(playerScrubber.value || 0))}`;
  });

  render();
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("file-read-failed"));
    reader.readAsDataURL(file);
  });

const initImagePage = () => {
  const page = document.querySelector("[data-image-page]");
  if (!page) return;
  const form = document.querySelector("[data-image-form]");
  const imageFileInput = form.elements.namedItem("imageFile");
  const recordDateInput = form.elements.namedItem("recordDate");
  const recordTimeInput = form.elements.namedItem("recordTime");
  const noteInput = form.elements.namedItem("note");
  const labelsNode = document.querySelector("[data-image-labels]");
  const previewNode = document.querySelector("[data-image-preview]");
  const statusNode = document.querySelector("[data-image-status]");
  let selectedLabelId = "";
  let previewDataUrl = "";

  const renderLabels = () => {
    const labels = getActiveLabels();
    if (!labels.length) {
      labelsNode.innerHTML = renderEmptyState("你尚未建立價格項目。", "請先到設定頁新增細部標籤後，再建立影像紀錄。", "settings.html", "前往設定");
      return;
    }
    selectedLabelId = selectedLabelId || labels[0].id;
    labelsNode.innerHTML = labels
      .map((label) => `<button type="button" class="chip-button ${selectedLabelId === label.id ? "is-active" : ""}" data-image-label="${label.id}"><span>${escapeHtml(label.labelName)}</span><strong>${escapeHtml(formatCurrency(label.amount))}</strong></button>`)
      .join("");
    labelsNode.querySelectorAll("[data-image-label]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedLabelId = button.dataset.imageLabel;
        renderLabels();
      });
    });
  };

  const renderPreview = (name = "") => {
    if (!previewDataUrl) {
      previewNode.innerHTML = renderEmptyState("尚未選擇影像。", "支援 JPG、PNG 與 WebP，建立後會直接進入對帳單與結帳資料來源。", "", "");
      return;
    }
    previewNode.innerHTML = `<img class="image-preview" src="${previewDataUrl}" alt="${escapeHtml(name || "影像預覽")}"><div class="detail-label">${escapeHtml(name || "影像預覽")}</div>`;
  };

  imageFileInput.addEventListener("change", async () => {
    const [file] = imageFileInput.files || [];
    if (!file) {
      previewDataUrl = "";
      return renderPreview();
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      statusNode.textContent = "目前只支援 JPG、PNG 或 WebP 圖片。";
      imageFileInput.value = "";
      previewDataUrl = "";
      return renderPreview();
    }
    previewDataUrl = await fileToDataUrl(file);
    statusNode.textContent = "";
    renderPreview(file.name);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const [file] = imageFileInput.files || [];
    const labels = getActiveLabels();
    const selectedLabel = labels.find((item) => item.id === selectedLabelId);
    if (!file || !previewDataUrl) return (statusNode.textContent = "請先選擇一張圖片。");
    if (!selectedLabel) {
      statusNode.textContent = "此價格項目已不存在或已停用，請重新選擇。";
      return renderLabels();
    }
    const dateValue = String(recordDateInput?.value || "") || new Date().toISOString().slice(0, 10);
    const timeValue = String(recordTimeInput?.value || "") || new Date().toISOString().slice(11, 16);
    createImageRecordWithDetail({
      fileName: file.name,
      mimeType: file.type,
      dataUrl: previewDataUrl,
      recordDate: dateValue,
      recordTime: combineDateTime(dateValue, timeValue),
      selectedLabel,
      note: String(noteInput?.value || "").trim()
    });
    form.reset();
    recordDateInput.value = dateValue;
    recordTimeInput.value = timeValue;
    previewDataUrl = "";
    renderPreview();
    renderLabels();
    renderHomeSummary();
    renderLauncherStats();
    statusNode.textContent = "影像紀錄已新增。你可以在對話對帳單中查看這一天的紀錄。";
    showToast("影像紀錄已新增。");
  });

  recordDateInput.value = new Date().toISOString().slice(0, 10);
  recordTimeInput.value = new Date().toISOString().slice(11, 16);
  renderLabels();
  renderPreview();
};

const initPage = () => {
  initNav();
  renderHomeSummary();
  renderLauncherStats();
  initRecordingPage();
  initCheckoutPage();
  initSettingsPage();
  initLedgerPage();
  initImagePage();
};

document.addEventListener("DOMContentLoaded", initPage);
