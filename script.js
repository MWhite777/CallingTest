// -----------------------------
//  Firebase Initialization
// -----------------------------
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

// Optional UI
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const participantsList = document.getElementById("participants-list");
const languageSelect = document.getElementById("language-select");
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
let userSelectedLanguage = "en";

if (languageSelect) {
  userSelectedLanguage = languageSelect.value || "en";
  languageSelect.addEventListener("change", (e) => {
    userSelectedLanguage = e.target.value || "en";
  });
}

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

function updateVideoLayout() {
  if (!videoGrid) return;
  const remoteVideos = videoGrid.querySelectorAll("video.remote-video");
  remoteVideos.forEach(v => v.classList.remove("fullscreen-remote"));
  if (remoteVideos.length === 1) {
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
  }
  videoGrid.appendChild(v);
  return v;
}

function addLocalVideo(stream) {
  let video = document.getElementById("video-local");
  if (!video) video = createVideoElement("video-local", true);
  video.srcObject = stream;
}

function addRemoteVideo(peerId, stream) {
  let peer = peers[peerId];
  if (!peer.videoEl) {
    const v = createVideoElement("remote-" + peerId, false);
    v.classList.add("remote-video");
    peer.videoEl = v;
  }
  peer.videoEl.srcObject = stream;
  peer.videoEl.play().catch(err => console.warn("play blocked", err));
  updateVideoLayout();
}

function showRoomInfoModal() {
  roomIdDisplay.textContent = roomId;
  roomInfoModal.style.display = "flex";
}

// -----------------------------
//  LOCAL MEDIA
// -----------------------------
async function startLocalMedia() {
  if (localStream) return localStream;
  try {
    setStatus("requesting media");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    addLocalVideo(localStream);
    setStatus("media ready");
    return localStream;
  } catch (err) {
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
    if (!event.candidate) return;
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
    const pc = createPeerConnectionForPeer(fromId);
    pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
  });
}

// -----------------------------
//  PARTICIPANTS
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
  const li = document.getElementById("user-" + id);
  if (li) li.remove();
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
  if (!roomRef) return;

  const EMPTY_TIMEOUT = 10 * 60 * 1000; // 10 min
  let emptySince = null;

  participantsRef.on("value", (snap) => {
    const participants = snap.val();
    const count = participants ? Object.keys(participants).length : 0;

    if (count === 0) {
      if (!emptySince) emptySince = Date.now();

      const elapsed = Date.now() - emptySince;
      if (elapsed > EMPTY_TIMEOUT) {
        console.log("[Cleanup] Room empty for 10 minutes. Removing...");
        roomRef.remove();
      }
    } else {
      emptySince = null;
    }
  });
}

// -----------------------------
//  INIT ROOM
// -----------------------------
function initRoomInfra() {
  participantsRef = roomRef.child("participants");
  myParticipantRef = participantsRef.push();
  clientId = myParticipantRef.key;

  myParticipantRef.set({
    lang: userSelectedLanguage,
    joinedAt: Date.now()
  });
  myParticipantRef.onDisconnect().remove();

  participantsRef.on("child_added", snap => {
    const pid = snap.key;
    addParticipantToUI(pid);
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
}

// -----------------------------
//  CREATE ROOM
// -----------------------------
async function createRoom() {
  roomId = generateRoomId();
  roomRef = database.ref(`rooms/${roomId}`);

  await roomRef.set({ createdAt: Date.now() });

  await startLocalMedia();
  initRoomInfra();

  joinModal.style.display = "none";
  endCallBtn.classList.remove("hidden");

  updateJoinCodeBadge();
  showRoomInfoModal();

  // 🔥 UPDATE URL WITHOUT RELOAD
  history.replaceState(null, "", `?room=${roomId}`);

  setStatus("room created");
}

// -----------------------------
//  JOIN ROOM
// -----------------------------
async function joinRoomById(id) {
  const snap = await database.ref(`rooms/${id}`).once("value");
  if (!snap.exists()) {
    alert("Room does not exist.");
    return;
  }

  roomId = id;
  roomRef = database.ref(`rooms/${roomId}`);

  await startLocalMedia();
  initRoomInfra();

  joinModal.style.display = "none";
  endCallBtn.classList.remove("hidden");

  updateJoinCodeBadge();

  // 🔥 Update URL to the joined room
  history.replaceState(null, "", `?room=${roomId}`);

  setStatus("joined room");
}

// -----------------------------
//  END CALL
// -----------------------------
async function endCall() {
  Object.keys(peers).forEach(pid => cleanupPeer(pid));

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  clearVideos();

  if (myParticipantRef) await myParticipantRef.remove();
  if (roomRef) roomRef.off();

  roomRef = null;
  roomId = null;
  clientId = null;

  updateJoinCodeBadge();
  joinModal.style.display = "flex";
  roomInfoModal.style.display = "none";
  endCallBtn.classList.add("hidden");

  // 🔥 Reset URL back to homepage
  history.replaceState(null, "", "/CallingTest");

  setStatus("idle");
}

// -----------------------------
//  EVENTS
// -----------------------------
startCallBtn.onclick = createRoom;
joinCallBtn.onclick = () => joinRoomById(roomIdInput.value.trim());
endCallBtn.onclick = endCall;

copyIdBtn.onclick = () => {
  navigator.clipboard.writeText(roomId);
  copyIdBtn.textContent = "Copied!";
  setTimeout(() => (copyIdBtn.textContent = "Copy ID"), 2000);
};

copyLinkBtn.onclick = () => {
  const url = `${location.origin}${location.pathname}?room=${roomId}`;
  navigator.clipboard.writeText(url);
  copyLinkBtn.textContent = "Link Copied!";
  setTimeout(() => (copyLinkBtn.textContent = "Copy Link"), 2000);
};

closeRoomInfoBtn.onclick = () => (roomInfoModal.style.display = "none");

// Mute
muteBtn.onclick = () => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  muteBtn.innerHTML = track.enabled
    ? '<i class="fas fa-microphone"></i><span>Mute</span>'
    : '<i class="fas fa-microphone-slash"></i><span>Unmute</span>';
};

// Video
videoBtn.onclick = () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  videoBtn.innerHTML = track.enabled
    ? '<i class="fas fa-video"></i><span>Stop Video</span>'
    : '<i class="fas fa-video-slash"></i><span>Start Video</span>';
};

// -----------------------------
//  AUTO-JOIN FROM URL
// -----------------------------
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get("room");
  if (urlRoom) joinRoomById(urlRoom);
});

// Cleanup on tab close
window.addEventListener("beforeunload", () => {
  try {
    if (myParticipantRef) myParticipantRef.remove();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
  } catch {}
});
