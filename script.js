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
const db = firebase.database();

// --- UI Elements ---
const joinModal = document.getElementById("join-modal");
const roomInfoModal = document.getElementById("room-info-modal");
const roomIdInput = document.getElementById("room-id-input");
const roomIdDisplay = document.getElementById("room-id-display");

const joinCallBtn = document.getElementById("join-call-btn");
const startCallBtn = document.getElementById("start-call-btn");
const copyIdBtn = document.getElementById("copy-id-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const closeRoomInfoBtn = document.getElementById("close-room-info-btn");

const muteBtn = document.getElementById("mute-btn");
const videoBtn = document.getElementById("video-btn");
const endCallBtn = document.getElementById("end-call-btn");

const videoGrid = document.getElementById("video-grid");

let localStream;
let peers = {};
let roomId = null;

// --- Get Local Media ---
async function initLocalStream() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    const localVideo = document.createElement("video");
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.autoplay = true;
    localVideo.classList.add("local-video");

    videoGrid.appendChild(localVideo);
}

startCallBtn.onclick = async () => {
    roomId = Math.random().toString(36).substring(2, 8);
    roomIdDisplay.textContent = roomId;

    joinModal.style.display = "none";
    roomInfoModal.style.display = "flex";

    await initCall(roomId);
};

joinCallBtn.onclick = async () => {
    roomId = roomIdInput.value.trim();
    if (!roomId) return alert("Enter a valid Room ID");

    joinModal.style.display = "none";
    await initCall(roomId);
};

closeRoomInfoBtn.onclick = () => {
    roomInfoModal.style.display = "none";
};

copyIdBtn.onclick = () => {
    navigator.clipboard.writeText(roomId);
};

copyLinkBtn.onclick = () => {
    navigator.clipboard.writeText(window.location.href + "?room=" + roomId);
};

// --- Init Call ---
async function initCall(roomId) {
    await initLocalStream();

    const roomRef = db.ref("calls/" + roomId);

    roomRef.on("child_added", snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (data.type === "offer" && data.sender !== firebaseConfig.messagingSenderId) {
            handleOffer(data);
        } else if (data.type === "answer" && data.sender !== firebaseConfig.messagingSenderId) {
            handleAnswer(data);
        } else if (data.type === "ice" && data.sender !== firebaseConfig.messagingSenderId) {
            handleIce(data);
        }
    });

    createPeer(roomId);
}

// --- Peer Creation ---
async function createPeer(roomId) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peers[roomId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = event => {
        const remoteVideo = document.createElement("video");
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        videoGrid.appendChild(remoteVideo);
    };

    pc.onicecandidate = event => {
        if (event.candidate) {
            db.ref("calls/" + roomId).push({
                sender: firebaseConfig.messagingSenderId,
                type: "ice",
                candidate: event.candidate
            });
        }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    db.ref("calls/" + roomId).push({
        sender: firebaseConfig.messagingSenderId,
        type: "offer",
        offer: offer
    });

    endCallBtn.classList.remove("hidden");
}

// --- Handle Offer ---
async function handleOffer(data) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peers[data.sender] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = event => {
        const remoteVideo = document.createElement("video");
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        videoGrid.appendChild(remoteVideo);
    };

    pc.onicecandidate = e => {
        if (e.candidate) {
            db.ref("calls/" + roomId).push({
                sender: firebaseConfig.messagingSenderId,
                type: "ice",
                candidate: e.candidate
            });
        }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    db.ref("calls/" + roomId).push({
        sender: firebaseConfig.messagingSenderId,
        type: "answer",
        answer: answer
    });

    endCallBtn.classList.remove("hidden");
}

// --- Handle Answer ---
async function handleAnswer(data) {
    const pc = peers[roomId];
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
}

// --- Handle ICE ---
function handleIce(data) {
    const pc = peers[roomId];
    if (!pc) return;
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
}

// --- Controls ---
muteBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.querySelector("span").textContent = audioTrack.enabled ? "Mute" : "Unmute";
};

videoBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    videoBtn.querySelector("span").textContent = videoTrack.enabled ? "Stop Video" : "Start Video";
};

endCallBtn.onclick = () => {
    window.location.reload();
};

// Auto join if ?room=ID
const params = new URLSearchParams(window.location.search);
const autoJoin = params.get("room");

if (autoJoin) {
    roomIdInput.value = autoJoin;
    joinCallBtn.click();
}
