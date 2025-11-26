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
//  TRANSLATIONS (EN / RU)
// -----------------------------
const translations = {
  en: {
    appTitle: "Firebase Video Call",
    languageLabel: "Language:",
    participantsTitle: "Participants",
    joinTitle: "Join or Start a Call",
    namePlaceholder: "Enter your name",
    roomPlaceholder: "Enter Room ID to join",
    joinCall: "Join Call",
    startCall: "Start New Call",
    roomReadyTitle: "Your Call is Ready!",
    roomReadyText: "Share this ID or link with others to join your call.",
    copyId: "Copy ID",
    copyLink: "Copy Link",
    close: "Close",
    mute: "Mute",
    unmute: "Unmute",
    stopVideo: "Stop Video",
    startVideo: "Start Video",
    endCall: "End Call",
    selfView: "Self View",
    qualityLabel: "Quality",
    qualityAuto: "Auto",
    quality480: "480p",
    quality720: "720p",
    quality1080: "1080p",
    quality2160: "4K",
    chatTitle: "Chat",
    chatTo: "To:",
    chatPlaceholder: "Type a message...",
    everyone: "Everyone",
    statusIdle: "idle",
    statusRequesting: "requesting media",
    statusReady: "media ready",
    statusCreated: "room created",
    statusJoined: "joined room",
    statusEnded: "idle",
    newMessageFrom: "New message from",
    imageMessage: "[image]"
  },
  ru: {
    appTitle: "Видеозвонок Firebase",
    languageLabel: "Язык:",
    participantsTitle: "Участники",
    joinTitle: "Присоединиться или создать звонок",
    namePlaceholder: "Введите ваше имя",
    roomPlaceholder: "Введите ID комнаты",
    joinCall: "Присоединиться",
    startCall: "Создать комнату",
    roomReadyTitle: "Ваша комната готова!",
    roomReadyText: "Поделитесь этим ID или ссылкой, чтобы другие могли присоединиться.",
    copyId: "Копировать ID",
    copyLink: "Копировать ссылку",
    close: "Закрыть",
    mute: "Выключить микрофон",
    unmute: "Включить микрофон",
    stopVideo: "Выключить видео",
    startVideo: "Включить видео",
    endCall: "Завершить звонок",
    selfView: "Моё видео",
    qualityLabel: "Качество",
    qualityAuto: "Авто",
    quality480: "480p",
    quality720: "720p",
    quality1080: "1080p",
    quality2160: "4K",
    chatTitle: "Чат",
    chatTo: "Кому:",
    chatPlaceholder: "Напишите сообщение...",
    everyone: "Все",
    statusIdle: "ожидание",
    statusRequesting: "запрос медиа",
    statusReady: "камера готова",
    statusCreated: "комната создана",
    statusJoined: "подключено",
    statusEnded: "ожидание",
    newMessageFrom: "Новое сообщение от",
    imageMessage: "[изображение]"
  }
};

let currentLanguage = "en";

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
const endCallBtn = document.getElementById("end-call-btn");
const selfViewBtn = document.getElementById("selfview-btn");
const resolutionSelect = document.getElementById("resolution-select");
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const languageSelect = document.getElementById("language-select");

// Chat panel elements
const chatPanel = document.getElementById("chat-panel");
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatTargetSelect = document.getElementById("chat-target-select");
const chatNotification = document.getElementById("chat-notification");
const chatUnreadDot = document.getElementById("chat-unread-dot");
const emojiBtn = document.getElementById("emoji-btn");
const emojiPicker = document.getElementById("emoji-picker");

// Participants UI
const participantsList = document.getElementById("participants-list");

// Optional future UI
const subtitlesContainer = document.getElementById("subtitles-container");

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
const peers = {};
const peerVAD = {};
let displayName = "";
const participantNames = {};
const CHAT_TARGET_PUBLIC = "__public__";
let chatListenersStarted = false;
let pinnedPeerId = null;
let selfViewMode = "small"; // small | large | hidden
let audioCtx = null;
let desiredResolution = "auto";
const chatMessageElements = {};

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
//  LANGUAGE / THEME HELPERS
// -----------------------------
function applyLanguage(lang) {
  currentLanguage = lang;
  const t = translations[lang] || translations.en;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key && t[key]) el.textContent = t[key];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key && t[key]) el.placeholder = t[key];
  });

  if (!roomId) {
    setStatus("statusIdle");
  }
}

function toggleTheme() {
  const body = document.body;
  if (body.classList.contains("theme-dark")) {
    body.classList.remove("theme-dark");
    body.classList.add("theme-light");
    localStorage.setItem("theme", "light");
  } else {
    body.classList.remove("theme-light");
    body.classList.add("theme-dark");
    localStorage.setItem("theme", "dark");
  }
}

// -----------------------------
//  HELPERS
// -----------------------------
function setStatus(textKeyOrRaw) {
  const t = translations[currentLanguage] || translations.en;
  const text = t[textKeyOrRaw] || textKeyOrRaw;
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

function updateVideoLayout() {
  if (!videoGrid) return;
  const remoteVideos = videoGrid.querySelectorAll("video.remote-video");
  remoteVideos.forEach(v => {
    v.classList.remove("fullscreen-remote");
    v.classList.remove("pinned");
  });

  if (pinnedPeerId && remoteVideos.length > 0) {
    const pinned = document.getElementById("remote-" + pinnedPeerId);
    if (pinned) pinned.classList.add("pinned");
  } else if (remoteVideos.length === 1) {
    remoteVideos[0].classList.add("fullscreen-remote");
  }
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
    v.addEventListener("click", () => {
      const peerId = id.replace("remote-", "");
      if (pinnedPeerId === peerId) pinnedPeerId = null;
      else pinnedPeerId = peerId;
      updateVideoLayout();
    });
  }
  videoGrid.appendChild(v);
  return v;
}

function getLocalVideoElement() {
  return document.getElementById("video-local");
}

function applySelfViewMode() {
  const v = getLocalVideoElement();
  if (!v) return;
  v.classList.remove("selfview-large", "selfview-hidden");
  if (selfViewMode === "large") {
    v.classList.add("selfview-large");
  } else if (selfViewMode === "hidden") {
    v.classList.add("selfview-hidden");
  }
}

function cycleSelfViewMode() {
  if (selfViewMode === "small") selfViewMode = "large";
  else if (selfViewMode === "large") selfViewMode = "hidden";
  else selfViewMode = "small";
  applySelfViewMode();
}

function addLocalVideo(stream) {
  let video = getLocalVideoElement();
  if (!video) video = createVideoElement("video-local", true);
  video.srcObject = stream;
  applySelfViewMode();
  setupVoiceActivityForStream("local", stream, video);
}

function addRemoteVideo(peerId, stream) {
  let peer = peers[peerId];
  if (!peer.videoEl) {
    const v = createVideoElement("remote-" + peerId, false);
    peer.videoEl = v;
  }
  peer.videoEl.srcObject = stream;
  peer.videoEl.play().catch(err => console.warn("play blocked", err));
  updateVideoLayout();
  setupVoiceActivityForStream(peerId, stream, peer.videoEl);
}

function showRoomInfoModal() {
  if (!roomIdDisplay || !roomInfoModal) return;
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
}

// -----------------------------
//  MEDIA CONSTRAINTS / RESOLUTION
// -----------------------------
function getVideoConstraints() {
  if (desiredResolution === "auto") return true;
  const height = parseInt(desiredResolution, 10);
  if (!height || isNaN(height)) return true;
  const width = Math.round((16 / 9) * height);
  return {
    width: { ideal: width },
    height: { ideal: height }
  };
}

async function restartLocalVideoWithNewResolution() {
  if (!localStream) return;
  try {
    const oldStream = localStream;
    const audioTracks = oldStream.getAudioTracks();

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: getVideoConstraints(),
      audio: audioTracks.length ? { deviceId: audioTracks[0].getSettings().deviceId ? { exact: audioTracks[0].getSettings().deviceId } : undefined } : true
    });

    localStream = newStream;
    addLocalVideo(localStream);

    const newVideoTrack = localStream.getVideoTracks()[0];
    Object.values(peers).forEach(p => {
      if (!p.pc) return;
      p.pc.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === "video" && newVideoTrack) {
          sender.replaceTrack(newVideoTrack).catch(console.error);
        }
      });
    });

    oldStream.getVideoTracks().forEach(t => t.stop());
  } catch (e) {
    console.error("Failed to change resolution", e);
  }
}

// -----------------------------
//  LOCAL MEDIA
// -----------------------------
async function startLocalMedia() {
  if (localStream) return localStream;
  try {
    setStatus("statusRequesting");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: getVideoConstraints(),
      audio: true
    });
    addLocalVideo(localStream);
    setStatus("statusReady");
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
//  PARTICIPANTS + PRIVATE CHAT TARGETS
// -----------------------------
function rebuildChatTargetSelect() {
  if (!chatTargetSelect) return;
  chatTargetSelect.innerHTML = "";
  const t = translations[currentLanguage] || translations.en;
  const optAll = document.createElement("option");
  optAll.value = CHAT_TARGET_PUBLIC;
  optAll.textContent = t.everyone || "Everyone";
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
      const indicator = document.createElement("span");
      indicator.className = "participant-indicator";
      indicator.id = "participant-indicator-" + id;
      const label = document.createElement("span");
      label.textContent = id === clientId ? `${name} (You)` : name;
      li.appendChild(indicator);
      li.appendChild(label);
      participantsList.appendChild(li);
    } else {
      li.querySelector("span:last-child").textContent =
        id === clientId ? `${name} (You)` : name;
    }
  }
  rebuildChatTargetSelect();
}

function removeParticipantFromUI(id) {
  delete participantNames[id];
  const li = document.getElementById("user-" + id);
  if (li) li.remove();
  rebuildChatTargetSelect();
}

function cleanupPeer(peerId) {
  const p = peers[peerId];
  if (!p) return;
  if (p.pc) p.pc.close();
  if (p.videoEl) p.videoEl.remove();
  delete peers[peerId];
  if (peerVAD[peerId] && peerVAD[peerId].rafId) {
    cancelAnimationFrame(peerVAD[peerId].rafId);
  }
  delete peerVAD[peerId];
  updateVideoLayout();
}

// -----------------------------
//  ROOM AUTO‑DELETE AFTER EMPTY FOR 10 MIN
// -----------------------------
function startRoomEmptyWatcher() {
  if (!roomRef || !participantsRef) return;
  const EMPTY_TIMEOUT = 10 * 60 * 1000;
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
//  VOICE ACTIVITY (VAD)
// -----------------------------
function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function setupVoiceActivityForStream(id, stream, videoEl) {
  try {
    const ctx = ensureAudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const isLocal = (id === "local");
    const targetId = isLocal ? clientId : id;

    function tick() {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      const speaking = avg > 40;

      if (videoEl) {
        if (speaking) videoEl.classList.add("speaking");
        else videoEl.classList.remove("speaking");
      }
      if (targetId) {
        const pi = document.getElementById("participant-indicator-" + targetId);
        if (pi) {
          if (speaking) pi.classList.add("speaking");
          else pi.classList.remove("speaking");
        }
      }

      const entry = peerVAD[id];
      if (entry && entry.stopped) return;
      peerVAD[id].rafId = requestAnimationFrame(tick);
    }

    peerVAD[id] = { analyser, stream, videoEl, rafId: requestAnimationFrame(tick) };
  } catch (e) {
    console.warn("VAD not available", e);
  }
}

// -----------------------------
//  CHAT
// -----------------------------
function chatPanelIsHidden() {
  return !chatPanel || chatPanel.style.display === "none" ||
    chatPanel.classList.contains("chat-panel--hidden");
}

let chatNotificationTimeout = null;

function showChatNotification(fromName, textOrLabel) {
  if (!chatNotification) return;
  const t = translations[currentLanguage] || translations.en;
  chatNotification.textContent = `${t.newMessageFrom || "New message from"} ${fromName}: ${textOrLabel}`;
  chatNotification.classList.remove("hidden");
  if (chatToggleBtn) chatToggleBtn.classList.add("has-unread");
  if (chatNotificationTimeout) clearTimeout(chatNotificationTimeout);
  chatNotificationTimeout = setTimeout(() => {
    chatNotification.classList.add("hidden");
  }, 4000);
}

function addChatMessageToUI(msg, scope, msgId) {
  if (!chatMessages) return;
  const fromId = msg.fromId || "unknown";
  const fromName = msg.fromName || participantNames[fromId] || fromId;
  const toId = msg.toId || null;
  const key = (scope || "public") + ":" + (msgId || "");
  let wrapper = chatMessageElements[key];
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "chat-message";
    chatMessageElements[key] = wrapper;
    chatMessages.appendChild(wrapper);
  }
  wrapper.innerHTML = "";

  let meta = "";
  if (scope === "public") {
    meta = `${fromName} \u2192 ${(translations[currentLanguage] || translations.en).everyone || "Everyone"}`;
  } else {
    if (fromId === clientId && toId) {
      const toName = participantNames[toId] || toId;
      meta = `You \u2192 ${toName} (private)`;
    } else if (toId === clientId) {
      meta = `${fromName} \u2192 You (private)`;
    } else {
      meta = `${fromName} (private)`;
    }
  }

  const metaEl = document.createElement("div");
  metaEl.className = "chat-message-meta";
  const metaText = document.createElement("span");
  metaText.textContent = meta;
  metaEl.appendChild(metaText);

  const reactionsBar = document.createElement("div");
  reactionsBar.className = "reactions-bar";
  const emojis = ["👍", "❤️", "😂"];
  emojis.forEach(emoji => {
    const btn = document.createElement("button");
    btn.className = "reaction-btn";
    btn.textContent = emoji;
    btn.onclick = () => {
      let countSpan = wrapper.querySelector(`.reaction-count-${emoji.codePointAt(0)}`);
      if (!countSpan) {
        countSpan = document.createElement("span");
        countSpan.className = `reaction-count-${emoji.codePointAt(0)}`;
        countSpan.textContent = emoji + " 1";
        reactionsBar.appendChild(countSpan);
      } else {
        const parts = countSpan.textContent.split(" ");
        let c = parseInt(parts[1] || "1", 10);
        c = (c % 3) + 1;
        countSpan.textContent = emoji + " " + c;
      }
    };
    reactionsBar.appendChild(btn);
  });
  metaEl.appendChild(reactionsBar);

  const textEl = document.createElement("div");
  textEl.className = "chat-message-text";

  if (msg.imageData) {
    const img = document.createElement("img");
    img.src = msg.imageData;
    img.alt = "image";
    textEl.appendChild(img);
    if (msg.text) {
      const caption = document.createElement("div");
      caption.textContent = msg.text;
      textEl.appendChild(caption);
    }
  } else {
    textEl.textContent = msg.text || "";
  }

  wrapper.appendChild(metaEl);
  wrapper.appendChild(textEl);

  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (chatPanelIsHidden() && fromId !== clientId) {
    const t = translations[currentLanguage] || translations.en;
    const label = msg.imageData ? (t.imageMessage || "[image]") : (msg.text || "");
    showChatNotification(fromName, label);
  }
}

function clearChatUI() {
  if (chatMessages) {
    chatMessages.innerHTML = "";
    Object.keys(chatMessageElements).forEach(k => delete chatMessageElements[k]);
  }
  if (chatTargetSelect) chatTargetSelect.innerHTML = "";
}

function startChatListeners() {
  if (chatListenersStarted || !roomRef || !clientId) return;
  chatListenersStarted = true;
  const chatRoot = roomRef.child("chat");

  const publicRef = chatRoot.child("public");
  publicRef.on("child_added", (snap) => {
    const msg = snap.val();
    if (!msg) return;
    addChatMessageToUI(msg, "public", snap.key);
  });

  const privateRef = chatRoot.child("private");
  privateRef.on("child_added", (snap) => {
    const msg = snap.val();
    if (!msg) return;
    const { fromId, toId } = msg;
    if (!fromId || !toId) return;
    if (fromId === clientId || toId === clientId) {
      addChatMessageToUI(msg, "private", snap.key);
    }
  });
  console.log("[Chat] listeners attached for room", roomId);
}

function stopChatListeners() {
  if (!roomRef) return;
  roomRef.child("chat").off();
  chatListenersStarted = false;
}

function sendTextOrImageMessage(text, imagePayload) {
  if (!roomRef || !clientId || !displayName) {
    alert("You must be in a room to chat.");
    return;
  }
  const target = chatTargetSelect ? chatTargetSelect.value : CHAT_TARGET_PUBLIC;
  const chatRoot = roomRef.child("chat");
  const ts = Date.now();

  const baseMsg = {
    fromId: clientId,
    fromName: displayName,
    ts
  };

  if (imagePayload) {
    baseMsg.imageData = imagePayload.dataUrl;
    baseMsg.imageType = imagePayload.type;
  }
  if (text) baseMsg.text = text;

  if (target === CHAT_TARGET_PUBLIC) {
    chatRoot.child("public").push(baseMsg);
  } else {
    baseMsg.toId = target;
    chatRoot.child("private").push(baseMsg);
  }
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  sendTextOrImageMessage(text, null);
  chatInput.value = "";
}

function handleFilesForChat(files) {
  if (!files || !files.length) return;
  const file = files[0];
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    sendTextOrImageMessage("", { dataUrl, type: file.type });
  };
  reader.readAsDataURL(file);
}

// -----------------------------
//  INIT ROOM
// -----------------------------
function initRoomInfra() {
  if (!roomRef) return;
  participantsRef = roomRef.child("participants");
  myParticipantRef = participantsRef.push();
  clientId = myParticipantRef.key;
  myParticipantRef.set({
    name: displayName || clientId,
    lang: currentLanguage,
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
//  SHOW/HIDE CHAT UI
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
    chatToggleBtn.classList.remove("has-unread");
  }
  if (chatNotification) chatNotification.classList.add("hidden");
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
  setStatus("statusCreated");
  showChatUI();
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
  setStatus("statusJoined");
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
  setStatus("statusEnded");
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
    const t = translations[currentLanguage] || translations.en;
    muteBtn.innerHTML = track.enabled
      ? `<i class="fas fa-microphone"></i><span>${t.mute}</span>`
      : `<i class="fas fa-microphone-slash"></i><span>${t.unmute}</span>`;
  };
}

// Video
if (videoBtn) {
  videoBtn.onclick = () => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const t = translations[currentLanguage] || translations.en;
    videoBtn.innerHTML = track.enabled
      ? `<i class="fas fa-video"></i><span>${t.stopVideo}</span>`
      : `<i class="fas fa-video-slash"></i><span>${t.startVideo}</span>`;
  };
}

// Self view mode
if (selfViewBtn) {
  selfViewBtn.onclick = () => {
    cycleSelfViewMode();
  };
}

// Resolution selector
if (resolutionSelect) {
  resolutionSelect.addEventListener("change", () => {
    desiredResolution = resolutionSelect.value || "auto";
    restartLocalVideoWithNewResolution();
  });
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
      chatToggleBtn.classList.remove("has-unread");
      if (chatNotification) chatNotification.classList.add("hidden");
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
  chatSendBtn.addEventListener("click", sendChatMessage);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

// Emoji picker
const EMOJIS = ["😀","😁","😂","🤣","😊","😍","😎","😢","😭","😡","👍","👎","❤️","🔥","💀"];
if (emojiBtn && emojiPicker) {
  EMOJIS.forEach(e => {
    const btn = document.createElement("button");
    btn.textContent = e;
    btn.onclick = () => {
      chatInput.value += e;
      chatInput.focus();
    };
    emojiPicker.appendChild(btn);
  });
  emojiBtn.addEventListener("click", () => {
    emojiPicker.classList.toggle("hidden");
  });
}

// Drag and drop for images
document.addEventListener("dragover", (e) => {
  e.preventDefault();
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  if (!roomRef) return;
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length) handleFilesForChat(files);
});

// Paste images
document.addEventListener("paste", (e) => {
  if (!roomRef) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const files = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === "file") {
      const f = items[i].getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) handleFilesForChat(files);
});

// Theme toggle
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", toggleTheme);
}

// Language select
if (languageSelect) {
  const savedLang = localStorage.getItem("lang");
  if (savedLang && translations[savedLang]) {
    currentLanguage = savedLang;
    languageSelect.value = savedLang;
  }
  languageSelect.addEventListener("change", () => {
    const lang = languageSelect.value || "en";
    currentLanguage = lang;
    localStorage.setItem("lang", lang);
    applyLanguage(lang);
  });
}

// -----------------------------
//  AUTO-JOIN PRE-FILL FROM URL
// -----------------------------
window.addEventListener("load", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    document.body.classList.remove("theme-dark");
    document.body.classList.add("theme-light");
  } else {
    document.body.classList.add("theme-dark");
  }

  applyLanguage(currentLanguage);

  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get("room");
  if (urlRoom && roomIdInput) {
    roomIdInput.value = urlRoom;
  }
});

// Cleanup on tab close
window.addEventListener("beforeunload", () => {
  try {
    if (myParticipantRef) myParticipantRef.remove();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
  } catch {}
});
