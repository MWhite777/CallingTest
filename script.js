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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// TURN + STUN servers
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
            urls: "turn:relay1.expressturn.com:3480",
            username: "000000002079386592",
            credential: "u1xEd/GlKAOmVY4fK+azNX8vbIY="
        }
    ]
};

let localStream;
let peerConnections = {};
let roomId = null;

// Elements
const videoGrid = document.getElementById("video-grid");
const muteBtn = document.getElementById("mute-btn");
const videoBtn = document.getElementById("video-btn");
const joinModal = document.getElementById("join-modal");
const startCallBtn = document.getElementById("start-call-btn");
const joinCallBtn = document.getElementById("join-call-btn");
const roomIdInput = document.getElementById("room-id-input");
const endCallBtn = document.getElementById("end-call-btn");

const roomInfoModal = document.getElementById("room-info-modal");
const roomIdDisplay = document.getElementById("room-id-display");
const closeRoomInfoBtn = document.getElementById("close-room-info-btn");
const copyIdBtn = document.getElementById("copy-id-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");

// Ask for permissions immediately
async function initLocalVideo() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    const localVideo = document.createElement("video");
    localVideo.srcObject = localStream;
    localVideo.autoplay = true;
    localVideo.muted = true;
    localVideo.classList.add("local-video");

    videoGrid.appendChild(localVideo);
}

initLocalVideo();

// Create PeerConnection for user
function createPeerConnection(remoteUserId) {
    const pc = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    const remoteVideo = document.createElement("video");
    remoteVideo.autoplay = true;
    remoteVideo.playsinline = true;
    remoteVideo.dataset.userid = remoteUserId;
    videoGrid.appendChild(remoteVideo);

    pc.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    pc.onicecandidate = event => {
        if (event.candidate) {
            db.ref(`rooms/${roomId}/candidates/${remoteUserId}/${myId}`).push(event.candidate.toJSON());
        }
    };

    return pc;
}

let myId = Math.random().toString(36).substring(2, 10);

// Start a new call
startCallBtn.onclick = async () => {
    roomId = Math.random().toString(36).substring(2, 8);
    roomIdDisplay.textContent = roomId;
    roomInfoModal.style.display = "flex";

    await db.ref(`rooms/${roomId}`).set({
        host: myId
    });

    joinModal.style.display = "none";
};

// Join an existing call
joinCallBtn.onclick = async () => {
    const id = roomIdInput.value.trim();
    if (!id) return;

    roomId = id;
    joinModal.style.display = "none";

    setupRoomListeners();
};

// Close "room ready" modal
closeRoomInfoBtn.onclick = () => {
    roomInfoModal.style.display = "none";
    setupRoomListeners();
};

// Copy room ID
copyIdBtn.onclick = () => {
    navigator.clipboard.writeText(roomId);
};

// Copy join link
copyLinkBtn.onclick = () => {
    navigator.clipboard.writeText(window.location.href + "?room=" + roomId);
};

// Room listeners
function setupRoomListeners() {
    db.ref(`rooms/${roomId}/offers`).on("child_added", async snapshot => {
        const remoteUserId = snapshot.key;
        const offer = snapshot.val();

        if (!peerConnections[remoteUserId]) {
            peerConnections[remoteUserId] = createPeerConnection(remoteUserId);
        }

        await peerConnections[remoteUserId].setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnections[remoteUserId].createAnswer();
        await peerConnections[remoteUserId].setLocalDescription(answer);

        await db.ref(`rooms/${roomId}/answers/${remoteUserId}/${myId}`).set(answer);
    });

    db.ref(`rooms/${roomId}/answers/${myId}`).on("child_added", async snapshot => {
        const remoteUserId = snapshot.key;
        const answer = snapshot.val();

        await peerConnections[remoteUserId].setRemoteDescription(new RTCSessionDescription(answer));
    });

    db.ref(`rooms/${roomId}/candidates/${myId}`).on("child_added", snapshot => {
        const candidate = snapshot.val();
        const remoteUserId = snapshot.ref.parent.key;

        if (peerConnections[remoteUserId]) {
            peerConnections[remoteUserId].addIceCandidate(new RTCIceCandidate(candidate));
        }
    });

    createOfferForExistingUsers();
}

async function createOfferForExistingUsers() {
    const roomRef = await db.ref(`rooms/${roomId}/offers`).get();
    const existingUsers = roomRef.exists() ? Object.keys(roomRef.val()) : [];

    existingUsers.forEach(async userId => {
        peerConnections[userId] = createPeerConnection(userId);

        const offer = await peerConnections[userId].createOffer();
        await peerConnections[userId].setLocalDescription(offer);

        await db.ref(`rooms/${roomId}/offers/${myId}`).set(offer);
    });
}

// Mute button
muteBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;

    muteBtn.querySelector("span").textContent = audioTrack.enabled ? "Mute" : "Unmute";
};

// Video button
videoBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;

    videoBtn.querySelector("span").textContent = videoTrack.enabled ? "Stop Video" : "Start Video";
};
