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
  appId: "1:222289306242:web:8963a4ea7ce852c2324a9b",
  measurementId: "G-BC52VQ658F"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
console.log("[Firebase] Initialized");

// -----------------------------
//  DOM ELEMENTS
// -----------------------------
const videoGrid = document.getElementById("video-grid");
const joinModal = document.getElementById("join-modal");
const roomInfoModal = document.getElementById("room-info-modal");
const roomIdDisplay = document.getElementById("room-id-display");
const roomIdInput = document.getElementById("room-id-input");
const startCallBtn = document.getElementById("start-call-btn");
const joinCallBtn = document.getElementById("join-call-btn");
const copyIdBtn = document.getElementById("copy-id-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const closeRoomInfoBtn = document.getElementById("close-room-info-btn");
const muteBtn = document.getElementById("mute-btn");
const videoBtn = document.getElementById("video-btn");
const endCallBtn = document.getElementById("end-call-btn");

// Optional chat / participants / language UI (won't crash if missing)
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const participantsList = document.getElementById("participants-list");
const languageSelect = document.getElementById("language-select");

// Simple subtitles container (optional)
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

// Join code bubble (always shows latest room ID)
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

// Multi‑peer state
let clientId = null;            // this client's unique id inside the room
let participantsRef = null;     // rooms/{roomId}/participants
let myParticipantRef = null;    // rooms/{roomId}/participants/{clientId}
// peerId -> { pc, remoteStream, videoEl }
const peers = {};

// language preference for translations (default english)
let userSelectedLanguage = "en";
if (languageSelect) {
  userSelectedLanguage = languageSelect.value || "en";
  languageSelect.addEventListener("change", (e) => {
    userSelectedLanguage = e.target.value || "en";
  });
}

// Device selection state
let selectedAudioDeviceId = null;
let selectedVideoDeviceId = null;

// Room cleanup timeout (10 min idle delete)
let roomCleanupTimeout = null;

// -----------------------------
//  ICE SERVERS (STUN + TURN)
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

// Update join-code bubble text
function updateJoinCodeBadge() {
  if (!joinCodeBadge) return;
  if (roomId) {
    joinCodeBadge.textContent = `CODE: ${roomId}`;
  } else {
    joinCodeBadge.textContent = "CODE: ----";
  }
}

// 1‑on‑1 fullscreen vs multi‑grid layout
function updateVideoLayout() {
  if (!videoGrid) return;
  const remoteVideos = videoGrid.querySelectorAll("video.remote-video");
  remoteVideos.forEach(v => v.classList.remove("fullscreen-remote"));
  if (remoteVideos.length === 1) {
    remoteVideos[0].classList.add("fullscreen-remote");
  }
}

function createVideoElement(id, isLocal = false) {
  const video = document.createElement("video");
  video.id = id;
  video.autoplay = true;
  video.playsInline = true;
  if (isLocal) {
    video.muted = true;
    video.classList.add("local-video");
  }
  videoGrid.appendChild(video);
  return video;
}

function addLocalVideo(stream) {
  if (!videoGrid || !stream) return;
  let video = document.getElementById("video-local");
  if (!video) {
    video = createVideoElement("video-local", true);
  }
  video.srcObject = stream;
}

function addRemoteVideo(peerId, stream) {
  if (!videoGrid) return;
  let peer = peers[peerId];
  if (!peer.videoEl) {
    const id = "remote-" + peerId;
    let video = document.getElementById(id);
    if (!video) {
      video = createVideoElement(id, false);
      video.classList.add("remote-video");
    }
    peer.videoEl = video;
  }
  peer.videoEl.srcObject = stream;
  const playPromise = peer.videoEl.play();
  if (playPromise !== undefined) {
    playPromise.catch((err) => {
      console.warn("[RemoteVideo] play() blocked:", err);
    });
  }
  // adjust fullscreen vs multi layout
  updateVideoLayout();
}

function showRoomInfoModal() {
  if (!roomId || !roomInfoModal || !roomIdDisplay) return;
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
}

function scheduleRoomCleanup(roomIdToClean) {
  if (!roomIdToClean) return;
  if (roomCleanupTimeout) clearTimeout(roomCleanupTimeout);

  roomCleanupTimeout = setTimeout(async () => {
    try {
      const participantsSnap = await database
        .ref(`rooms/${roomIdToClean}/participants`)
        .once("value");

      if (!participantsSnap.exists()) {
        await database.ref(`rooms/${roomIdToClean}`).remove();
        console.log("[Cleanup] Removed empty room after 10 min:", roomIdToClean);
      } else {
        console.log(
          "[Cleanup] Room still has participants after 10 min, not removed:",
          roomIdToClean
        );
      }
    } catch (e) {
      console.warn("[Cleanup] Error during room cleanup:", e);
    }
  }, 10 * 60 * 1000); // 10 minutes
}

// -----------------------------
//  MEDIA
// -----------------------------
// NOTE: we no longer auto-call this on join/host.
// Media is started only when user selects mic/cam.
async function startLocalMedia(constraints) {
  try {
    setStatus("requesting media");
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log("[Media] Got local stream with tracks:", stream.getTracks().map(t => t.kind));
    return stream;
  } catch (err) {
    console.error("[Media] Error accessing devices:", err);
    alert("Could not access camera/microphone.");
    setStatus("media error");
    throw err;
  }
}

// Sync localStream tracks to all peer connections & renegotiate
function syncLocalTracksToPeers() {
  if (!localStream) return;

  Object.values(peers).forEach(({ pc }) => {
    if (!pc) return;
    const senders = pc.getSenders();
    const tracks = localStream.getTracks();

    ["audio", "video"].forEach(kind => {
      const newTrack = tracks.find(t => t.kind === kind) || null;
      const sender = senders.find(s => s.track && s.track.kind === kind);

      if (sender && newTrack) {
        if (sender.track !== newTrack) {
          sender.replaceTrack(newTrack).catch(err => {
            console.warn("[Tracks] replaceTrack error:", err);
          });
        }
      } else if (!sender && newTrack) {
        pc.addTrack(newTrack, localStream);
      } else if (sender && !newTrack) {
        sender.replaceTrack(null).catch(err => {
          console.warn("[Tracks] remove track error:", err);
        });
      }
    });
  });

  // Renegotiate with all peers (send updated offers)
  Object.keys(peers).forEach(peerId => {
    connectToPeer(peerId);
  });
}

// -----------------------------
//  MULTI‑PEER WEBRTC
// -----------------------------
function createPeerConnectionForPeer(peerId) {
  if (peers[peerId] && peers[peerId].pc) return peers[peerId].pc;

  console.log("[WebRTC] Creating RTCPeerConnection for peer:", peerId);
  setStatus("creating peer " + peerId);

  const pc = new RTCPeerConnection(configuration);
  const remoteStream = new MediaStream();

  peers[peerId] = {
    pc,
    remoteStream,
    videoEl: peers[peerId]?.videoEl || null
  };

  // If we already have localStream, attach tracks
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  pc.oniceconnectionstatechange = () => {
    const s = pc.iceConnectionState;
    console.log("[WebRTC] iceConnectionState for", peerId, ":", s);
    setStatus("ice(" + peerId + "): " + s);
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    console.log("[WebRTC] connectionState for", peerId, ":", s);
    setStatus("conn(" + peerId + "): " + s);
  };

  // Remote tracks
  pc.ontrack = (event) => {
    console.log("[WebRTC] Got remote track from", peerId);
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    peers[peerId].remoteStream = remoteStream;
    addRemoteVideo(peerId, remoteStream);
  };

  // ICE candidates -> Firebase signaling
  pc.onicecandidate = (event) => {
    if (!event.candidate || !roomRef || !clientId) return;
    const signalsRef = roomRef.child("signals").child(peerId).child(clientId);
    console.log("[WebRTC] ICE candidate for", peerId);
    signalsRef.child("ice").push(event.candidate.toJSON());
  };

  return pc;
}

async function connectToPeer(peerId) {
  try {
    console.log("[WebRTC] connectToPeer", peerId);
    const pc = createPeerConnectionForPeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const signalsRef = roomRef.child("signals").child(peerId).child(clientId);
    await signalsRef.child("offer").set({
      type: offer.type,
      sdp: offer.sdp
    });
    console.log("[WebRTC] Sent offer to", peerId);
  } catch (err) {
    console.error("[WebRTC] Error connecting to peer", peerId, err);
  }
}

// Handle incoming offers/answers/ICE for a given peer
function setupSignalHandlersForPeer(fromId, fromRef) {
  // Offer (we are callee) - allow renegotiation (no guard)
  fromRef.child("offer").on("value", async (snap) => {
    const offer = snap.val();
    if (!offer) return;
    console.log("[Signal] Got offer from", fromId);
    const pc = createPeerConnectionForPeer(fromId);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const backRef = roomRef.child("signals").child(fromId).child(clientId);
      await backRef.child("answer").set({
        type: answer.type,
        sdp: answer.sdp
      });
      console.log("[Signal] Sent answer to", fromId);
    } catch (e) {
      console.warn("[Signal] Error handling offer from", fromId, e);
    }
  });

  // Answer (we are caller) - allow repeated answers
  fromRef.child("answer").on("value", async (snap) => {
    const answer = snap.val();
    if (!answer) return;
    console.log("[Signal] Got answer from", fromId);
    const pc = createPeerConnectionForPeer(fromId);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (e) {
      console.warn("[Signal] Error setting remote answer from", fromId, e);
    }
  });

  // ICE candidates
  fromRef.child("ice").on("child_added", (snap) => {
    const cand = snap.val();
    if (!cand) return;
    const pc = createPeerConnectionForPeer(fromId);
    const candidate = new RTCIceCandidate(cand);
    pc.addIceCandidate(candidate).catch((err) => {
      console.error("[Signal] Error adding ICE from", fromId, err);
    });
  });
}

// -----------------------------
//  PARTICIPANTS (CONTACT LIST)
// -----------------------------
function addParticipantToUI(id) {
  if (!participantsList) return;
  let li = document.getElementById("user-" + id);
  if (!li) {
    li = document.createElement("li");
    li.id = "user-" + id;
    li.textContent = id === clientId ? id + " (You)" : id;
    participantsList.appendChild(li);
  }
}

function removeParticipantFromUI(id) {
  if (!participantsList) return;
  const li = document.getElementById("user-" + id);
  if (li) li.remove();
}

function cleanupPeer(peerId) {
  const peer = peers[peerId];
  if (!peer) return;
  if (peer.pc) {
    try {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.close();
    } catch (e) {
      console.warn(e);
    }
  }
  if (peer.remoteStream) {
    peer.remoteStream.getTracks().forEach((t) => t.stop());
  }
  if (peer.videoEl) {
    peer.videoEl.remove();
  }
  delete peers[peerId];
  // recalc layout after someone leaves
  updateVideoLayout();
}

// -----------------------------
//  ROOM CHAT + TRANSLATION
// -----------------------------
function addChatMessageToUI(msg) {
  if (!chatMessages) {
    console.warn("[Chat] chatMessages element missing");
    return;
  }
  const div = document.createElement("div");
  div.textContent = `${msg.sender}: ${msg.text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage(text) {
  if (!roomRef) return;
  const message = {
    sender: clientId || "anon",
    text,
    ts: Date.now()
  };
  roomRef.child("chat").push(message);
}

// LibreTranslate API
async function translateText(text, targetLang = "en") {
  try {
    const res = await fetch("https://libretranslate.com/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target: targetLang,
        format: "text"
      })
    });
    const data = await res.json();
    if (data && data.translatedText) return data.translatedText;
    return text;
  } catch (err) {
    console.error("[Translate] Error:", err);
    return text; // fallback: original text
  }
}

function startChatListener() {
  if (!roomRef) return;
  roomRef.child("chat").on("child_added", async (snap) => {
    const msg = snap.val();
    if (!msg) return;
    // Translate each message into user's selected language
    const translated = await translateText(msg.text, userSelectedLanguage);
    addChatMessageToUI({
      sender: msg.sender,
      text: translated
    });
    // Optionally also show as subtitles (for simple "spoken text -> translated")
    if (subtitlesContainer) {
      subtitlesContainer.textContent = `${msg.sender}: ${translated}`;
    }
  });
}

if (chatSendBtn && chatInput) {
  chatSendBtn.addEventListener("click", () => {
    const text = chatInput.value.trim();
    if (text !== "") {
      sendChatMessage(text);
      chatInput.value = "";
    }
  });
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      chatSendBtn.click();
    }
  });
}

// -----------------------------
//  ROOM PRESENCE + SIGNALING
// -----------------------------
function initRoomInfra() {
  if (!roomRef) return;

  // PARTICIPANTS
  participantsRef = roomRef.child("participants");
  myParticipantRef = participantsRef.push();
  clientId = myParticipantRef.key;
  console.log("[Room] My clientId:", clientId);
  myParticipantRef.set({
    lang: userSelectedLanguage,
    joinedAt: Date.now()
  });
  myParticipantRef.onDisconnect().remove();

  // Listen for participants join/leave
  participantsRef.on("child_added", (snap) => {
    const pid = snap.key;
    if (!pid) return;
    addParticipantToUI(pid);
    if (pid === clientId) return;
    // Only one side should initiate connection -> use simple lexicographic rule
    if (clientId > pid) {
      connectToPeer(pid);
    }
  });

  participantsRef.on("child_removed", (snap) => {
    const pid = snap.key;
    if (!pid) return;
    removeParticipantFromUI(pid);
    cleanupPeer(pid);
  });

  // SIGNALING (everything targeted "to me")
  const mySignalsRef = roomRef.child("signals").child(clientId);
  mySignalsRef.on("child_added", (snap) => {
    const fromId = snap.key;
    const fromRef = snap.ref;
    console.log("[Signal] New signal branch from", fromId);
    setupSignalHandlersForPeer(fromId, fromRef);
  });

  // CHAT
  startChatListener();
}

// -----------------------------
//  CALL FLOW - CREATE ROOM
// -----------------------------
async function createRoom() {
  try {
    roomId = generateRoomId();
    roomRef = database.ref(`rooms/${roomId}`);
    console.log("[Room] Creating room:", roomId);
    setStatus("creating room " + roomId);

    await roomRef.set({
      createdAt: Date.now()
    });

    initRoomInfra();

    // UI
    if (joinModal) joinModal.style.display = "none";
    if (endCallBtn) endCallBtn.classList.remove("hidden");
    showRoomInfoModal();
    updateJoinCodeBadge();
    setStatus("room created: " + roomId);

    // Update URL to include ?room=ID
    if (window.history && window.history.pushState) {
      const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      window.history.pushState({ roomId }, "", newUrl);
    }

    // Schedule idle cleanup for this room
    scheduleRoomCleanup(roomId);
  } catch (err) {
    console.error("[Room] Error creating room:", err);
    setStatus("error creating room");
  }
}

// -----------------------------
//  CALL FLOW - JOIN ROOM
// -----------------------------
async function joinRoomById(id) {
  if (!id) {
    alert("Please enter a Room ID.");
    return;
  }
  try {
    console.log("[Room] Trying to join room:", id);
    setStatus("joining room " + id);

    const roomSnapshot = await database.ref(`rooms/${id}`).once("value");
    if (!roomSnapshot.exists()) {
      alert("Session does not exist.");
      console.log("[Room] Room not found in DB");
      setStatus("room not found");
      return;
    }

    roomId = id;
    roomRef = database.ref(`rooms/${roomId}`);

    initRoomInfra();

    // UI
    if (joinModal) joinModal.style.display = "none";
    if (endCallBtn) endCallBtn.classList.remove("hidden");
    updateJoinCodeBadge();
    setStatus("joined room " + roomId);

    // Update URL to include ?room=ID
    if (window.history && window.history.pushState) {
      const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      window.history.pushState({ roomId }, "", newUrl);
    }

    // Schedule idle cleanup for this room
    scheduleRoomCleanup(roomId);
  } catch (err) {
    console.error("[Room] Error joining room:", err);
    setStatus("error joining room");
  }
}

// -----------------------------
//  END CALL / CLEANUP
// -----------------------------
async function endCall() {
  console.log("[Call] Ending call");
  setStatus("ending call");
  try {
    // Close all peer connections
    Object.keys(peers).forEach((pid) => cleanupPeer(pid));

    // Local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    clearVideos();

    // Remove our participant & listeners
    if (myParticipantRef) {
      try {
        await myParticipantRef.remove();
      } catch (e) {
        console.warn("[Call] Error removing participant:", e);
      }
      myParticipantRef = null;
    }
    if (roomRef && roomId) {
      try {
        roomRef.off(); // detach all listeners for this client
      } catch (err) {
        console.warn("[Call] Error cleaning room listeners:", err);
      }
    }
    roomRef = null;
    roomId = null;
    clientId = null;
    updateJoinCodeBadge();

    if (joinModal) joinModal.style.display = "flex";
    if (roomInfoModal) roomInfoModal.style.display = "none";
    if (endCallBtn) endCallBtn.classList.add("hidden");
    if (roomIdInput) roomIdInput.value = "";
    setStatus("idle");
  } catch (err) {
    console.error("[Call] Error ending call:", err);
    setStatus("error ending call");
  }
}

// -----------------------------
//  DEVICE ENUM / SELECT UI
//  (Mic + Camera buttons next to controls)
// -----------------------------
function setupDeviceSelectorButtons() {
  const controlsBlock = document.querySelector(".main__controls__block");
  if (!controlsBlock) return;

  // Create Mic button
  const selectMicBtn = document.createElement("button");
  selectMicBtn.id = "select-mic-btn";
  selectMicBtn.className = "main__controls__button";
  selectMicBtn.innerHTML = '<i class="fas fa-microphone"></i><span>Select Mic</span>';

  // Create Camera button
  const selectCamBtn = document.createElement("button");
  selectCamBtn.id = "select-cam-btn";
  selectCamBtn.className = "main__controls__button";
  selectCamBtn.innerHTML = '<i class="fas fa-video"></i><span>Select Cam</span>';

  controlsBlock.appendChild(selectMicBtn);
  controlsBlock.appendChild(selectCamBtn);

  // Device enumeration helper
  async function listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      mics: devices.filter(d => d.kind === "audioinput"),
      cams: devices.filter(d => d.kind === "videoinput")
    };
  }

  // Select microphone
  selectMicBtn.addEventListener("click", async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      alert("Device selection not supported in this browser.");
      return;
    }

    const { mics } = await listDevices();
    if (mics.length === 0) {
      alert("No microphones detected.");
      return;
    }

    const choice = prompt(
      "Select a microphone by number:\n\n" +
      mics.map((m, i) => `${i + 1}. ${m.label || "Mic " + (i + 1)}`).join("\n")
    );
    const index = parseInt(choice, 10) - 1;
    if (isNaN(index) || index < 0 || index >= mics.length) return;

    const deviceId = mics[index].deviceId;
    selectedAudioDeviceId = deviceId;

    try {
      const micStream = await startLocalMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false
      });

      const newAudioTrack = micStream.getAudioTracks()[0];
      if (!newAudioTrack) return;

      if (!localStream) {
        localStream = new MediaStream();
      }

      // Replace existing audio tracks in localStream
      localStream.getAudioTracks().forEach(t => t.stop());
      localStream.getAudioTracks().forEach(t => localStream.removeTrack(t));
      localStream.addTrack(newAudioTrack);

      addLocalVideo(localStream);
      syncLocalTracksToPeers();
      setStatus("mic selected");
    } catch (e) {
      console.warn("[Devices] Error selecting mic:", e);
    }
  });

  // Select camera
  selectCamBtn.addEventListener("click", async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      alert("Device selection not supported in this browser.");
      return;
    }

    const { cams } = await listDevices();
    if (cams.length === 0) {
      alert("No cameras detected.");
      return;
    }

    const choice = prompt(
      "Select a camera by number:\n\n" +
      cams.map((c, i) => `${i + 1}. ${c.label || "Camera " + (i + 1)}`).join("\n")
    );
    const index = parseInt(choice, 10) - 1;
    if (isNaN(index) || index < 0 || index >= cams.length) return;

    const deviceId = cams[index].deviceId;
    selectedVideoDeviceId = deviceId;

    try {
      const camStream = await startLocalMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });

      const newVideoTrack = camStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      if (!localStream) {
        localStream = new MediaStream();
      }

      // Replace existing video tracks in localStream
      localStream.getVideoTracks().forEach(t => t.stop());
      localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
      localStream.addTrack(newVideoTrack);

      addLocalVideo(localStream);
      syncLocalTracksToPeers();
      setStatus("camera selected");
    } catch (e) {
      console.warn("[Devices] Error selecting camera:", e);
    }
  });
}

// -----------------------------
//  BUTTON EVENTS
// -----------------------------
if (startCallBtn) {
  startCallBtn.addEventListener("click", () => {
    createRoom().catch(console.error);
  });
}

if (joinCallBtn) {
  joinCallBtn.addEventListener("click", () => {
    const inputRoomId = roomIdInput ? roomIdInput.value.trim() : "";
    joinRoomById(inputRoomId).catch(console.error);
  });
}

if (endCallBtn) {
  endCallBtn.addEventListener("click", () => {
    endCall();
  });
}

if (copyIdBtn) {
  copyIdBtn.addEventListener("click", () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).then(() => {
      const originalText = copyIdBtn.textContent;
      copyIdBtn.textContent = "Copied!";
      setTimeout(() => {
        copyIdBtn.textContent = originalText;
      }, 2000);
    });
  });
}

if (copyLinkBtn) {
  copyLinkBtn.addEventListener("click", () => {
    if (!roomId) return;
    const roomUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(roomUrl).then(() => {
      const originalText = copyLinkBtn.textContent;
      copyLinkBtn.textContent = "Link Copied!";
      setTimeout(() => {
        copyLinkBtn.textContent = originalText;
      }, 2000);
    });
  });
}

if (closeRoomInfoBtn) {
  closeRoomInfoBtn.addEventListener("click", () => {
    if (roomInfoModal) roomInfoModal.style.display = "none";
  });
}

// Mute / Unmute
if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    const enabled = audioTrack.enabled;
    audioTrack.enabled = !enabled;
    muteBtn.innerHTML = enabled
      ? '<i class="fas fa-microphone-slash"></i><span>Unmute</span>'
      : '<i class="fas fa-microphone"></i><span>Mute</span>';
  });
}

// Toggle Video
if (videoBtn) {
  videoBtn.addEventListener("click", () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    const enabled = videoTrack.enabled;
    videoTrack.enabled = !enabled;
    videoBtn.innerHTML = enabled
      ? '<i class="fas fa-video-slash"></i><span>Start Video</span>'
      : '<i class="fas fa-video"></i><span>Stop Video</span>';
  });
}

// Cleanup when leaving page
window.addEventListener("beforeunload", () => {
  try {
    Object.keys(peers).forEach((pid) => cleanupPeer(pid));
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (myParticipantRef) {
      myParticipantRef.remove();
    }
  } catch (e) {
    console.warn(e);
  }
});

// Auto-join if ?room=ID in URL + setup device buttons
window.addEventListener("load", () => {
  setupDeviceSelectorButtons();

  const urlParams = new URLSearchParams(window.location.search);
  const urlRoomId = urlParams.get("room");
  if (urlRoomId && roomIdInput) {
    roomIdInput.value = urlRoomId;
    joinRoomById(urlRoomId).catch(console.error);
  }
});
