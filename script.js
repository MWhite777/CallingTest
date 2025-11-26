// -----------------------------
//  Firebase Initialization
// -----------------------------
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDl1rBlKbZezkdPHQovpXR_QZ_1v2w-sQg",
  authDomain: "my-calling-test.firebaseapp.com",
  databaseURL: "https://my-calling-test-default-rtdb.firebaseio.com",
  projectId: "my-calling-test",
  storageBucket: "my-calling-test.firebasestorage.app",
  messagingSenderId: "222289306242",
  appId: "1:222289306242:web:e841cbc95876665d324a9b",
  measurementId: "G-TW6X4N95L5"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
console.log("[Firebase] Initialized");

// -----------------------------
//  SIMPLE I18N (EN / RU)
// -----------------------------
const I18N = {
  en: {
    app_title: "Firebase Video Call",
    participants_title: "Participants",
    chat_title: "Chat",
    chat_to: "To:",
    chat_placeholder: "Type a message...",
    join_title: "Join or Start a Call",
    name_placeholder: "Enter your name",
    room_placeholder: "Enter Room ID to join",
    btn_join_call: "Join Call",
    btn_start_call: "Start New Call",
    room_ready_title: "Your Call is Ready!",
    room_ready_text: "Share this ID or link with others to join your call.",
    btn_copy_id: "Copy ID",
    btn_copy_link: "Copy Link",
    btn_close: "Close",
    btn_mute: "Mute",
    btn_unmute: "Unmute",
    btn_stop_video: "Stop Video",
    btn_start_video: "Start Video",
    btn_end_call: "End Call",
    btn_selfview: "Self View",
    resolution_auto: "Auto",
    camera_default: "Default camera",
    mic_default: "Default mic",
    everyone: "Everyone",
    toast_new_message: "New message from"
  },
  ru: {
    app_title: "Видеозвонок Firebase",
    participants_title: "Участники",
    chat_title: "Чат",
    chat_to: "Кому:",
    chat_placeholder: "Введите сообщение...",
    join_title: "Подключиться или начать звонок",
    name_placeholder: "Введите ваше имя",
    room_placeholder: "Введите ID комнаты",
    btn_join_call: "Подключиться",
    btn_start_call: "Начать звонок",
    room_ready_title: "Комната готова!",
    room_ready_text: "Поделитесь этим ID или ссылкой, чтобы к вам присоединились.",
    btn_copy_id: "Копировать ID",
    btn_copy_link: "Копировать ссылку",
    btn_close: "Закрыть",
    btn_mute: "Выключить микрофон",
    btn_unmute: "Включить микрофон",
    btn_stop_video: "Выключить видео",
    btn_start_video: "Включить видео",
    btn_end_call: "Завершить звонок",
    btn_selfview: "Моё видео",
    resolution_auto: "Авто",
    camera_default: "Камера по умолчанию",
    mic_default: "Микрофон по умолчанию",
    everyone: "Все",
    toast_new_message: "Новое сообщение от"
  }
};

let currentLanguage = "en";

function applyTranslations() {
  const dict = I18N[currentLanguage];

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key]) el.placeholder = dict[key];
  });

  // Buttons that use text in JS (mute/video labels) will be handled separately
}

// -----------------------------
//  DOM ELEMENTS
// -----------------------------
const videoGrid = document.getElementById("video-grid");
const joinModal = document.getElementById("join-modal");
const roomInfoModal = document.getElementById("room-info-modal");
const roomIdDisplay = document.getElementById("room-id-display");
const roomIdInput = document.getElementById("room-id-input");
const displayNameInput = document.getElementById("display-name-input");
const startCallBtn = document.getElementById("start-call-btn");
const joinCallBtn = document.getElementById("join-call-btn");
const copyIdBtn = document.getElementById("copy-id-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const closeRoomInfoBtn = document.getElementById("close-room-info-btn");
const muteBtn = document.getElementById("mute-btn");
const videoBtn = document.getElementById("video-btn");
const selfViewBtn = document.getElementById("selfview-mode-btn");
const endCallBtn = document.getElementById("end-call-btn");

// Device selectors
const resolutionSelect = document.getElementById("resolution-select");
const cameraSelect = document.getElementById("camera-select");
const micSelect = document.getElementById("mic-select");

// Chat panel elements
const chatPanel = document.getElementById("chat-panel");
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatTargetSelect = document.getElementById("chat-target-select");
const emojiPickerBtn = document.getElementById("emoji-picker-btn");
const emojiPicker = document.getElementById("emoji-picker");
const chatToast = document.getElementById("chat-toast");

// Top bar
const languageSelect = document.getElementById("language-select");
const themeToggleBtn = document.getElementById("theme-toggle-btn");

// Participants UI
const participantsList = document.getElementById("participants-list");

// Status label
let statusLabel = document.getElementById("status-label");
if (!statusLabel) {
  statusLabel = document.createElement("div");
  statusLabel.id = "status-label";
  statusLabel.style.position = "fixed";
  statusLabel.style.left = "10px";
  statusLabel.style.bottom = "60px";
  statusLabel.style.color = "#ccc";
  statusLabel.style.fontSize = "12px";
  statusLabel.style.fontFamily = "monospace";
  statusLabel.textContent = "Status: idle";
  document.body.appendChild(statusLabel);
}

// Join code badge
let joinCodeBadge = document.getElementById("join-code-badge");
if (!joinCodeBadge) {
  joinCodeBadge = document.createElement("div");
  joinCodeBadge.id = "join-code-badge";
  joinCodeBadge.textContent = "CODE: ----";
  document.body.appendChild(joinCodeBadge);
}

// -----------------------------
//  STATE
// -----------------------------
let localStream = null;
let roomRef = null;
let roomId = null;
let clientId = null;
let participantsRef = null;
let myParticipantRef = null;
const peers = {};           // peerId -> { pc, remoteStream, videoEl, audioMonitor }
const participantNames = {}; // clientId -> name
const CHAT_TARGET_PUBLIC = "__public__";
let chatListenersStarted = false;

// layout / UI
let pinnedPeerId = null;
let selfViewModeIndex = 0; // 0 = small, 1 = hidden, 2 = large
const selfViewModes = ["small", "hidden", "large"];

// language & theme
if (languageSelect) {
  currentLanguage = languageSelect.value || "en";
  applyTranslations();
}

// Device selection
let selectedResolution = "default";
let selectedCameraId = "";
let selectedMicId = "";

// Audio / speaking detection
let audioContext = null;

// -----------------------------
//  ICE SERVERS
// -----------------------------
const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:relay1.expressturn.com:3480",
      username: "000000002079386592",
      credential: "u1xEd/GlKAOmVY4fK+azNX8vbIY="
    }
  ]
};

// -----------------------------
//  HELPERS
// -----------------------------
function setStatus(text) {
  if (statusLabel) statusLabel.textContent = "Status: " + text;
  console.log("[Status]", text);
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

function clearVideos() {
  if (videoGrid) videoGrid.innerHTML = "";
}

function updateJoinCodeBadge() {
  if (!joinCodeBadge) return;
  joinCodeBadge.textContent = roomId ? `CODE: ${roomId}` : "CODE: ----";
}

function updateLayoutClass() {
  if (!videoGrid) return;
  const remoteVideos = videoGrid.querySelectorAll("video.remote-video");
  const count = remoteVideos.length;

  videoGrid.classList.remove("layout-single", "layout-two", "layout-grid");
  if (count <= 1) {
    videoGrid.classList.add("layout-single");
  } else if (count === 2) {
    videoGrid.classList.add("layout-two");
  } else {
    videoGrid.classList.add("layout-grid");
  }
}

function updateVideoLayout() {
  updateLayoutClass();
}

function createVideoElement(id, isLocal = false) {
  const v = document.createElement("video");
  v.id = id;
  v.autoplay = true;
  v.playsInline = true;
  if (isLocal) {
    v.muted = true;
    v.classList.add("local-video");
  } else {
    v.classList.add("remote-video");
  }
  videoGrid.appendChild(v);
  return v;
}

function getLocalVideoElement() {
  return document.getElementById("video-local");
}

function applySelfViewMode() {
  const video = getLocalVideoElement();
  if (!video) return;
  const mode = selfViewModes[selfViewModeIndex % selfViewModes.length];
  video.classList.remove("hidden", "large");
  if (mode === "hidden") {
    video.classList.add("hidden");
  } else if (mode === "large") {
    video.classList.add("large");
  }
}

function addLocalVideo(stream) {
  let video = getLocalVideoElement();
  if (!video) video = createVideoElement("video-local", true);
  video.srcObject = stream;
  applySelfViewMode();
}

function addRemoteVideo(peerId, stream) {
  let peer = peers[peerId];
  if (!peer.videoEl) {
    const v = createVideoElement("remote-" + peerId, false);
    v.dataset.peerId = peerId;
    peer.videoEl = v;

    // Click to pin
    v.addEventListener("click", () => {
      if (pinnedPeerId === peerId) {
        pinnedPeerId = null;
      } else {
        pinnedPeerId = peerId;
      }
      applyPinState();
    });
  }
  peer.videoEl.srcObject = stream;
  peer.videoEl.play().catch(err => console.warn("play blocked", err));
  updateVideoLayout();
  attachAudioMonitor(stream, peer.videoEl, peerId);
}

function applyPinState() {
  const remoteVideos = videoGrid.querySelectorAll("video.remote-video");
  remoteVideos.forEach(v => {
    v.classList.remove("pinned-video");
  });
  if (!pinnedPeerId) return;
  const pinnedEl = document.getElementById("remote-" + pinnedPeerId);
  if (pinnedEl) {
    pinnedEl.classList.add("pinned-video");
  }
}

// -----------------------------
//  AUDIO MONITOR (Voice Activity Indicator)
// -----------------------------
function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function attachAudioMonitor(stream, element, peerId) {
  try {
    const ac = getAudioContext();
    const source = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      if (!element || !document.body.contains(element)) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      const speaking = avg > 40; // threshold
      if (speaking) {
        element.classList.add("speaking");
      } else {
        element.classList.remove("speaking");
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  } catch (e) {
    console.warn("Audio monitor failed", e);
  }
}

// -----------------------------
//  DEVICE ENUMERATION / RESOLUTION
// -----------------------------
async function enumerateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (cameraSelect) {
      cameraSelect.innerHTML = "";
      const defOpt = document.createElement("option");
      defOpt.value = "";
      defOpt.textContent = I18N[currentLanguage].camera_default;
      cameraSelect.appendChild(defOpt);
      devices.filter(d => d.kind === "videoinput").forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${cameraSelect.length}`;
        cameraSelect.appendChild(opt);
      });
    }
    if (micSelect) {
      micSelect.innerHTML = "";
      const defOpt = document.createElement("option");
      defOpt.value = "";
      defOpt.textContent = I18N[currentLanguage].mic_default;
      micSelect.appendChild(defOpt);
      devices.filter(d => d.kind === "audioinput").forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Mic ${micSelect.length}`;
        micSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn("enumerateDevices error", e);
  }
}

function getVideoConstraints() {
  let width, height;
  if (selectedResolution === "720p") {
    width = 1280; height = 720;
  } else if (selectedResolution === "1080p") {
    width = 1920; height = 1080;
  } else if (selectedResolution === "2160p") {
    width = 3840; height = 2160;
  }
  const constraints = {};
  if (width && height) {
    constraints.width = { ideal: width };
    constraints.height = { ideal: height };
  }
  if (selectedCameraId) {
    constraints.deviceId = { exact: selectedCameraId };
  }
  return Object.keys(constraints).length ? constraints : true;
}

function getAudioConstraints() {
  const constraints = {};
  if (selectedMicId) {
    constraints.deviceId = { exact: selectedMicId };
  }
  return Object.keys(constraints).length ? constraints : true;
}

// -----------------------------
//  LOCAL MEDIA
// -----------------------------
async function startLocalMedia() {
  if (localStream) return localStream;
  try {
    setStatus("requesting media");
    const video = getVideoConstraints();
    const audio = getAudioConstraints();
    localStream = await navigator.mediaDevices.getUserMedia({
      video,
      audio
    });
    addLocalVideo(localStream);
    attachAudioMonitor(localStream, getLocalVideoElement(), clientId || "local");
    await enumerateDevices();
    setStatus("media ready");
    return localStream;
  } catch (err) {
    console.error(err);
    alert("Could not access camera/microphone.");
    throw err;
  }
}

// -----------------------------
//  WEBRTC
// -----------------------------
function createPeerConnectionForPeer(peerId) {
  if (peers[peerId] && peers[peerId].pc) return peers[peerId].pc;
  const pc = new RTCPeerConnection(configuration);
  const remoteStream = new MediaStream();
  peers[peerId] = { pc, remoteStream, videoEl: null };

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    addRemoteVideo(peerId, remoteStream);
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate || !roomRef || !clientId) return;
    roomRef.child("signals").child(peerId).child(clientId)
      .child("ice").push(event.candidate.toJSON());
  };

  return pc;
}

async function connectToPeer(peerId) {
  const pc = createPeerConnectionForPeer(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  roomRef.child("signals").child(peerId).child(clientId)
    .child("offer").set({ type: offer.type, sdp: offer.sdp });
}

function setupSignalHandlersForPeer(fromId, fromRef) {
  fromRef.child("offer").on("value", async snap => {
    const offer = snap.val();
    if (!offer) return;
    const pc = createPeerConnectionForPeer(fromId);
    if (!pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      roomRef.child("signals").child(fromId).child(clientId)
        .child("answer").set({ type: answer.type, sdp: answer.sdp });
    }
  });
  fromRef.child("answer").on("value", async snap => {
    const ans = snap.val();
    if (!ans) return;
    const pc = createPeerConnectionForPeer(fromId);
    if (!pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(ans));
    }
  });
  fromRef.child("ice").on("child_added", snap => {
    const cand = snap.val();
    if (!cand) return;
    const pc = createPeerConnectionForPeer(fromId);
    pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
  });
}

// -----------------------------
//  PARTICIPANTS + TARGETS
// -----------------------------
function rebuildChatTargetSelect() {
  if (!chatTargetSelect) return;
  chatTargetSelect.innerHTML = "";
  // Everyone (public)
  const optAll = document.createElement("option");
  optAll.value = CHAT_TARGET_PUBLIC;
  optAll.textContent = I18N[currentLanguage].everyone;
  chatTargetSelect.appendChild(optAll);
  Object.keys(participantNames).forEach(id => {
    const name = participantNames[id] || id;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id === clientId ? `${name} (You)` : name;
    chatTargetSelect.appendChild(opt);
  });
}

function addParticipantToUI(id, data) {
  const name = (data && data.name) || id;
  participantNames[id] = name;
  if (participantsList) {
    let li = document.getElementById("user-" + id);
    if (!li) {
      li = document.createElement("li");
      li.id = "user-" + id;
      const dot = document.createElement("span");
      dot.className = "participant-dot";
      const span = document.createElement("span");
      span.textContent = id === clientId ? `${name} (You)` : name;
      li.appendChild(dot);
      li.appendChild(span);
      participantsList.appendChild(li);
    } else {
      li.querySelector("span:nth-child(2)").textContent =
        id === clientId ? `${name} (You)` : name;
    }
  }
  rebuildChatTargetSelect();
}

function removeParticipantFromUI(id) {
  delete participantNames[id];
  const li = document.getElementById("user-" + id);
  if (li && participantsList) li.remove();
  rebuildChatTargetSelect();
}

function cleanupPeer(peerId) {
  const p = peers[peerId];
  if (!p) return;
  if (p.pc) p.pc.close();
  if (p.videoEl) p.videoEl.remove();
  delete peers[peerId];
  updateVideoLayout();
}

// -----------------------------
//  ROOM AUTO‑DELETE AFTER EMPTY FOR 10 MIN
// -----------------------------
function startRoomEmptyWatcher() {
  if (!roomRef || !participantsRef) return;
  const EMPTY_TIMEOUT = 10 * 60 * 1000; // 10 min
  let emptySince = null;
  participantsRef.on("value", (snap) => {
    const participants = snap.val();
    const count = participants ? Object.keys(participants).length : 0;
    if (count === 0) {
      if (!emptySince) emptySince = Date.now();
      const elapsed = Date.now() - emptySince;
      if (elapsed > EMPTY_TIMEOUT) {
        console.log("[Cleanup] Room empty for 10 minutes. Removing room (and chats)...");
        roomRef.remove();
      }
    } else {
      emptySince = null;
    }
  });
}

// -----------------------------
//  CHAT: PUBLIC + PRIVATE + IMAGES + GIF + REACTIONS
// -----------------------------
const EMOJIS = ["😀","😁","😂","🤣","😊","😍","😎","😢","👍","❤️","🔥","🤔"];

function ensureEmojiPicker() {
  if (!emojiPicker) return;
  emojiPicker.innerHTML = "";
  EMOJIS.forEach(e => {
    const span = document.createElement("span");
    span.textContent = e;
    span.addEventListener("click", () => {
      chatInput.value += e;
      emojiPicker.classList.add("hidden");
    });
    emojiPicker.appendChild(span);
  });
}

function addChatMessageToUI(msg, scope, messageId) {
  if (!chatMessages) return;
  const fromId = msg.fromId || "unknown";
  const fromName = msg.fromName || participantNames[fromId] || fromId;
  const toId = msg.toId || null;
  const type = msg.type || "text";

  let meta = "";
  if (scope === "public") {
    meta = `${fromName} → ${I18N[currentLanguage].everyone}`;
  } else {
    if (fromId === clientId && toId) {
      const toName = participantNames[toId] || toId;
      meta = `You → ${toName} (private)`;
    } else if (toId === clientId) {
      meta = `${fromName} → You (private)`;
    } else {
      meta = `${fromName} (private)`;
    }
  }

  const wrapper = document.createElement("div");
  wrapper.className = "chat-message";
  wrapper.dataset.scope = scope;
  wrapper.dataset.messageId = messageId || "";

  const metaEl = document.createElement("div");
  metaEl.className = "chat-message-meta";
  metaEl.textContent = meta;

  const textEl = document.createElement("div");
  textEl.className = "chat-message-text";

  if (type === "image" && msg.imageData) {
    const img = document.createElement("img");
    img.src = msg.imageData;
    img.className = "chat-message-image";
    textEl.appendChild(img);
  } else if (msg.isGifUrl && msg.text) {
    const img = document.createElement("img");
    img.src = msg.text;
    img.className = "chat-message-image";
    textEl.appendChild(img);
  } else {
    textEl.textContent = msg.text || "";
  }

  wrapper.appendChild(metaEl);
  wrapper.appendChild(textEl);

  // Reactions
  const reactionsContainer = document.createElement("div");
  reactionsContainer.className = "chat-message-reactions";

  ["👍","❤️","😂"].forEach(emoji => {
    const btn = document.createElement("button");
    btn.className = "chat-reaction-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      toggleReaction(scope, messageId, emoji);
    });
    reactionsContainer.appendChild(btn);
  });

  // existing reactions from DB
  if (msg.reactions) {
    Object.keys(msg.reactions).forEach(emoji => {
      const users = msg.reactions[emoji];
      const count = Object.keys(users || {}).length;
      if (!count) return;
      const btn = Array.from(reactionsContainer.children)
        .find(b => b.textContent === emoji);
      if (btn) {
        btn.textContent = `${emoji} ${count}`;
        if (users[clientId]) btn.classList.add("active");
      }
    });
  }

  wrapper.appendChild(reactionsContainer);

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateMessageReactionsUI(scope, messageId, msg) {
  const el = Array.from(chatMessages.children).find(
    m => m.dataset.scope === scope && m.dataset.messageId === messageId
  );
  if (!el) return;
  const reactionsContainer = el.querySelector(".chat-message-reactions");
  if (!reactionsContainer) return;
  ["👍","❤️","😂"].forEach(emoji => {
    const btn = Array.from(reactionsContainer.children)
      .find(b => b.textContent.startsWith(emoji));
    if (!btn) return;
    btn.classList.remove("active");
    btn.textContent = emoji;
  });
  if (!msg.reactions) return;
  Object.keys(msg.reactions).forEach(emoji => {
    const users = msg.reactions[emoji];
    const count = Object.keys(users || {}).length;
    if (!count) return;
    const btn = Array.from(reactionsContainer.children)
      .find(b => b.textContent.startsWith(emoji));
    if (btn) {
      btn.textContent = `${emoji} ${count}`;
      if (users[clientId]) btn.classList.add("active");
    }
  });
}

function clearChatUI() {
  if (chatMessages) chatMessages.innerHTML = "";
  if (chatTargetSelect) {
    chatTargetSelect.innerHTML = "";
  }
}

// chat toast
let toastTimeout = null;
function showChatToast(fromName, preview) {
  if (!chatToast) return;
  const dict = I18N[currentLanguage];
  chatToast.textContent = `${dict.toast_new_message} ${fromName}: ${preview}`;
  chatToast.classList.remove("hidden");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    chatToast.classList.add("hidden");
  }, 4000);
}

// start listeners for current room
function startChatListeners() {
  if (chatListenersStarted || !roomRef || !clientId) return;
  chatListenersStarted = true;
  const chatRoot = roomRef.child("chat");

  // PUBLIC
  const publicRef = chatRoot.child("public");
  publicRef.on("child_added", (snap) => {
    const msg = snap.val();
    if (!msg) return;
    addChatMessageToUI(msg, "public", snap.key);

    // notification if panel hidden and not from self
    const isOpen = chatPanel && chatPanel.classList.contains("chat-panel--open");
    if (!isOpen && msg.fromId !== clientId) {
      const preview = msg.text || "[image]";
      showChatToast(msg.fromName || "Someone", preview.slice(0, 40));
      if (chatToggleBtn) chatToggleBtn.classList.add("has-new");
    }
  });
  publicRef.on("child_changed", (snap) => {
    const msg = snap.val();
    if (!msg) return;
    updateMessageReactionsUI("public", snap.key, msg);
  });

  // PRIVATE (single feed, filter for this client)
  const privateRef = chatRoot.child("private");
  privateRef.on("child_added", (snap) => {
    const msg = snap.val();
    if (!msg) return;
    const { fromId, toId } = msg;
    if (!fromId || !toId) return;
    if (fromId === clientId || toId === clientId) {
      addChatMessageToUI(msg, "private", snap.key);
      const isOpen = chatPanel && chatPanel.classList.contains("chat-panel--open");
      if (!isOpen && fromId !== clientId) {
        const preview = msg.text || "[image]";
        showChatToast(msg.fromName || "Someone", preview.slice(0, 40));
        if (chatToggleBtn) chatToggleBtn.classList.add("has-new");
      }
    }
  });
  privateRef.on("child_changed", (snap) => {
    const msg = snap.val();
    if (!msg) return;
    const { fromId, toId } = msg;
    if (!fromId || !toId) return;
    if (fromId === clientId || toId === clientId) {
      updateMessageReactionsUI("private", snap.key, msg);
    }
  });

  console.log("[Chat] listeners attached for room", roomId);
}

function stopChatListeners() {
  if (!roomRef) return;
  roomRef.child("chat").off();
  chatListenersStarted = false;
}

function detectGifUrl(text) {
  if (!text) return false;
  const url = text.trim();
  return /^https?:\/\/.+\.gif(\?.*)?$/i.test(url);
}

function sendChatMessage(type = "text", imageData = null) {
  if (!roomRef || !clientId || !displayName) {
    alert("You must be in a room to chat.");
    return;
  }

  let text = chatInput.value.trim();
  if (type === "text" && !text) return;

  const target = chatTargetSelect ? chatTargetSelect.value : CHAT_TARGET_PUBLIC;
  const chatRoot = roomRef.child("chat");
  const ts = Date.now();

  if (type === "image" && imageData) {
    const msg = {
      fromId: clientId,
      fromName: displayName,
      type: "image",
      imageData,
      ts
    };
    if (target === CHAT_TARGET_PUBLIC) {
      chatRoot.child("public").push(msg);
    } else {
      msg.toId = target;
      chatRoot.child("private").push(msg);
    }
  } else {
    const isGifUrl = detectGifUrl(text);
    const baseMsg = {
      fromId: clientId,
      fromName: displayName,
      text,
      ts
    };
    if (isGifUrl) baseMsg.isGifUrl = true;

    if (target === CHAT_TARGET_PUBLIC) {
      chatRoot.child("public").push(baseMsg);
    } else {
      baseMsg.toId = target;
      chatRoot.child("private").push(baseMsg);
    }
  }

  chatInput.value = "";
}

function toggleReaction(scope, messageId, emoji) {
  if (!roomRef || !messageId) return;
  const ref = roomRef.child("chat").child(scope).child(messageId).child("reactions").child(emoji).child(clientId);
  ref.once("value").then(snap => {
    if (snap.exists()) {
      ref.remove();
    } else {
      ref.set(true);
    }
  });
}

// Drag & drop / paste images
function handleFilesForChat(files) {
  if (!files || !files.length) return;
  Array.from(files).forEach(file => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      // WARNING: storing large images in DB will be heavy
      sendChatMessage("image", dataUrl);
    };
    reader.readAsDataURL(file);
  });
}

// -----------------------------
//  INIT ROOM
// -----------------------------
let displayName = "";

function initRoomInfra() {
  if (!roomRef) return;
  participantsRef = roomRef.child("participants");
  myParticipantRef = participantsRef.push();
  clientId = myParticipantRef.key;
  myParticipantRef.set({
    name: displayName || clientId,
    joinedAt: Date.now()
  });
  myParticipantRef.onDisconnect().remove();

  participantsRef.on("child_added", snap => {
    const pid = snap.key;
    const pdata = snap.val() || {};
    addParticipantToUI(pid, pdata);
    if (pid !== clientId && clientId > pid) connectToPeer(pid);
  });

  participantsRef.on("child_removed", snap => {
    const pid = snap.key;
    removeParticipantFromUI(pid);
    cleanupPeer(pid);
  });

  roomRef.child("signals").child(clientId).on("child_added", snap => {
    setupSignalHandlersForPeer(snap.key, snap.ref);
  });

  startRoomEmptyWatcher();
  startChatListeners();
}

// -----------------------------
//  SHOW/HIDE CHAT UI BY CALL STATE
// -----------------------------
function showChatUI() {
  if (chatPanel) {
    chatPanel.style.display = "flex";
    chatPanel.classList.add("chat-panel--hidden");
    chatPanel.classList.remove("chat-panel--open");
  }
  if (chatToggleBtn) {
    chatToggleBtn.style.display = "flex";
  }
}

function hideChatUI() {
  if (chatPanel) {
    chatPanel.style.display = "none";
    chatPanel.classList.add("chat-panel--hidden");
    chatPanel.classList.remove("chat-panel--open");
  }
  if (chatToggleBtn) {
    chatToggleBtn.style.display = "none";
    chatToggleBtn.classList.remove("has-new");
  }
  clearChatUI();
}

// -----------------------------
//  CREATE ROOM
// -----------------------------
async function createRoom() {
  const name = displayNameInput ? displayNameInput.value.trim() : "";
  if (!name) {
    alert("Please enter your name first.");
    return;
  }
  displayName = name;
  roomId = generateRoomId();
  roomRef = database.ref(`rooms/${roomId}`);
  await roomRef.set({ createdAt: Date.now() });
  await startLocalMedia();
  initRoomInfra();
  if (joinModal) joinModal.style.display = "none";
  if (endCallBtn) endCallBtn.classList.remove("hidden");
  updateJoinCodeBadge();
  showRoomInfoModal();
  history.replaceState(null, "", `?room=${roomId}`);
  setStatus("room created");
  showChatUI();
}

function showRoomInfoModal() {
  if (!roomIdDisplay || !roomInfoModal) return;
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
}

// -----------------------------
//  JOIN ROOM
// -----------------------------
async function joinRoomById(id) {
  const name = displayNameInput ? displayNameInput.value.trim() : "";
  if (!name) {
    alert("Please enter your name first.");
    return;
  }
  displayName = name;
  const snap = await database.ref(`rooms/${id}`).once("value");
  if (!snap.exists()) {
    alert("Room does not exist.");
    return;
  }
  roomId = id;
  roomRef = database.ref(`rooms/${roomId}`);
  await startLocalMedia();
  initRoomInfra();
  if (joinModal) joinModal.style.display = "none";
  if (endCallBtn) endCallBtn.classList.remove("hidden");
  updateJoinCodeBadge();
  history.replaceState(null, "", `?room=${roomId}`);
  setStatus("joined room");
  showChatUI();
}

// -----------------------------
//  END CALL
// -----------------------------
async function endCall() {
  console.log("[Call] Ending call");
  Object.keys(peers).forEach(pid => cleanupPeer(pid));
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  clearVideos();
  if (myParticipantRef) {
    try {
      await myParticipantRef.remove();
    } catch (e) {
      console.warn(e);
    }
  }
  stopChatListeners();
  hideChatUI();
  if (roomRef) {
    roomRef.off();
  }
  Object.keys(participantNames).forEach(k => delete participantNames[k]);
  roomRef = null;
  roomId = null;
  clientId = null;
  participantsRef = null;
  myParticipantRef = null;
  updateJoinCodeBadge();
  if (joinModal) joinModal.style.display = "flex";
  if (roomInfoModal) roomInfoModal.style.display = "none";
  if (endCallBtn) endCallBtn.classList.add("hidden");
  history.replaceState(null, "", window.location.pathname);
  setStatus("idle");
}

// -----------------------------
//  EVENTS
// -----------------------------
if (startCallBtn) {
  startCallBtn.onclick = createRoom;
}
if (joinCallBtn) {
  joinCallBtn.onclick = () => {
    const id = roomIdInput ? roomIdInput.value.trim() : "";
    if (!id) {
      alert("Enter a Room ID.");
      return;
    }
    joinRoomById(id);
  };
}
if (endCallBtn) {
  endCallBtn.onclick = endCall;
}
if (copyIdBtn) {
  copyIdBtn.onclick = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    const old = copyIdBtn.textContent;
    copyIdBtn.textContent = "Copied!";
    setTimeout(() => (copyIdBtn.textContent = old), 2000);
  };
}
if (copyLinkBtn) {
  copyLinkBtn.onclick = () => {
    if (!roomId) return;
    const url = `${location.origin}${location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    const old = copyLinkBtn.textContent;
    copyLinkBtn.textContent = "Link Copied!";
    setTimeout(() => (copyLinkBtn.textContent = old), 2000);
  };
}
if (closeRoomInfoBtn) {
  closeRoomInfoBtn.onclick = () => {
    if (roomInfoModal) roomInfoModal.style.display = "none";
  };
}

// Mute
if (muteBtn) {
  muteBtn.onclick = () => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const dict = I18N[currentLanguage];
    muteBtn.innerHTML = track.enabled
      ? `<i class="fas fa-microphone"></i><span>${dict.btn_mute}</span>`
      : `<i class="fas fa-microphone-slash"></i><span>${dict.btn_unmute}</span>`;
  };
}

// Video
if (videoBtn) {
  videoBtn.onclick = () => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const dict = I18N[currentLanguage];
    videoBtn.innerHTML = track.enabled
      ? `<i class="fas fa-video"></i><span>${dict.btn_stop_video}</span>`
      : `<i class="fas fa-video-slash"></i><span>${dict.btn_start_video}</span>`;
  };
}

// Self-view mode button
if (selfViewBtn) {
  selfViewBtn.onclick = () => {
    selfViewModeIndex = (selfViewModeIndex + 1) % selfViewModes.length;
    applySelfViewMode();
  };
}

// Chat UI events
if (chatToggleBtn && chatPanel) {
  chatToggleBtn.addEventListener("click", () => {
    const open = chatPanel.classList.contains("chat-panel--open");
    if (open) {
      chatPanel.classList.remove("chat-panel--open");
      chatPanel.classList.add("chat-panel--hidden");
    } else {
      chatPanel.classList.remove("chat-panel--hidden");
      chatPanel.classList.add("chat-panel--open");
      chatToggleBtn.classList.remove("has-new");
      if (chatToast) chatToast.classList.add("hidden");
    }
  });
}
if (chatCloseBtn && chatPanel) {
  chatCloseBtn.addEventListener("click", () => {
    chatPanel.classList.remove("chat-panel--open");
    chatPanel.classList.add("chat-panel--hidden");
  });
}
if (chatSendBtn && chatInput) {
  chatSendBtn.addEventListener("click", () => sendChatMessage("text"));
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatMessage("text");
    }
  });
}

// Emoji picker
if (emojiPickerBtn && emojiPicker) {
  ensureEmojiPicker();
  emojiPickerBtn.addEventListener("click", () => {
    emojiPicker.classList.toggle("hidden");
  });
}

// Drag & drop into chat
if (chatPanel) {
  ["dragover", "dragenter"].forEach(ev => {
    chatPanel.addEventListener(ev, (e) => {
      e.preventDefault();
    });
  });
  chatPanel.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files) {
      handleFilesForChat(e.dataTransfer.files);
    }
  });
}

// Paste images
document.addEventListener("paste", (e) => {
  if (!chatInput || document.activeElement !== chatInput) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const files = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      files.push(items[i].getAsFile());
    }
  }
  if (files.length) {
    handleFilesForChat(files);
    e.preventDefault();
  }
});

// Language select
if (languageSelect) {
  languageSelect.addEventListener("change", () => {
    currentLanguage = languageSelect.value || "en";
    applyTranslations();
    // Update dynamic button labels
    const dict = I18N[currentLanguage];
    // reset mute/video labels based on current stream state
    if (muteBtn) {
      const enabled = localStream ? localStream.getAudioTracks()[0]?.enabled !== false : true;
      muteBtn.innerHTML = enabled
        ? `<i class="fas fa-microphone"></i><span>${dict.btn_mute}</span>`
        : `<i class="fas fa-microphone-slash"></i><span>${dict.btn_unmute}</span>`;
    }
    if (videoBtn) {
      const enabled = localStream ? localStream.getVideoTracks()[0]?.enabled !== false : true;
      videoBtn.innerHTML = enabled
        ? `<i class="fas fa-video"></i><span>${dict.btn_stop_video}</span>`
        : `<i class="fas fa-video-slash"></i><span>${dict.btn_start_video}</span>`;
    }
    rebuildChatTargetSelect();
  });
}

// Theme toggle
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-theme");
    themeToggleBtn.innerHTML = isLight
      ? '<i class="fas fa-sun"></i>'
      : '<i class="fas fa-moon"></i>';
  });
}

// Resolution / device selects
if (resolutionSelect) {
  resolutionSelect.addEventListener("change", async () => {
    selectedResolution = resolutionSelect.value;
    if (!localStream) return;
    // restart video track with new constraints
    try {
      const video = getVideoConstraints();
      const audio = getAudioConstraints();
      const newStream = await navigator.mediaDevices.getUserMedia({ video, audio });
      // replace tracks in peer connections
      const oldStream = localStream;
      localStream = newStream;
      addLocalVideo(localStream);
      attachAudioMonitor(localStream, getLocalVideoElement(), clientId || "local");
      Object.values(peers).forEach(p => {
        const senders = p.pc.getSenders();
        const newVideoTrack = localStream.getVideoTracks()[0];
        const newAudioTrack = localStream.getAudioTracks()[0];
        senders.forEach(s => {
          if (s.track && s.track.kind === "video" && newVideoTrack) {
            s.replaceTrack(newVideoTrack);
          }
          if (s.track && s.track.kind === "audio" && newAudioTrack) {
            s.replaceTrack(newAudioTrack);
          }
        });
      });
      oldStream.getTracks().forEach(t => t.stop());
    } catch (e) {
      console.warn("Failed to change resolution", e);
    }
  });
}

if (cameraSelect) {
  cameraSelect.addEventListener("change", () => {
    selectedCameraId = cameraSelect.value;
  });
}

if (micSelect) {
  micSelect.addEventListener("change", () => {
    selectedMicId = micSelect.value;
  });
}

// -----------------------------
//  AUTO-JOIN PRE-FILL FROM URL
// -----------------------------
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get("room");
  if (urlRoom && roomIdInput) {
    roomIdInput.value = urlRoom;
  }
  applyTranslations();
});

// Cleanup on tab close
window.addEventListener("beforeunload", () => {
  try {
    if (myParticipantRef) myParticipantRef.remove();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
  } catch {}
});
