import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff, ScreenShare, Hand, MessageSquare,
  Users, PhoneOff, Maximize2, Minimize2, CheckCircle2, AlertTriangle,
  Clock, ShieldCheck, Send, X, Radio, ChevronRight
} from 'lucide-react';
import { api } from '../services/api';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

function RemoteVideoTile({ peerId, remote, raisedHands }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !remote?.stream) return;

    if (videoEl.srcObject !== remote.stream) {
      videoEl.srcObject = remote.stream;
    }

    const playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Autoplay error on remote tile, attempting muted fallback:', err);
        videoEl.muted = true;
        videoEl.play().catch(e => console.warn('Muted autoplay fallback error:', e));
      });
    }
  }, [remote?.stream, remote?.version]);

  const hasRaisedHand = raisedHands?.some(h => h.studentId === peerId);

  return (
    <div className="relative rounded-2xl bg-[#071b34] border border-[#133966] overflow-hidden flex items-center justify-center min-h-[190px] sm:min-h-[220px] shadow-lg">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-[#040d1a]/85 backdrop-blur-md border border-[#133966] text-[11px] sm:text-xs font-bold text-white flex items-center gap-1.5">
          <span className="truncate max-w-[120px]">{remote?.name || 'Participant'}</span>
          {remote?.role === 'teacher' && (
            <span className="text-[9px] px-1 rounded bg-[#00a896]/30 text-[#00C49F]">Faculty</span>
          )}
          {hasRaisedHand && <span className="text-xs">✋</span>}
        </div>
      </div>
    </div>
  );
}

export default function OnlineClassRoom({ classId, user, onLeave, onClassEnded }) {
  const isTeacher = user?.role === 'teacher';

  // Room state
  const [classInfo, setClassInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [streamError, setStreamError] = useState('');

  // Media state
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Peer connections: map of peerId -> RTCPeerConnection
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> { stream, name, role }
  const peerConnectionsRef = useRef(new Map());
  const iceCandidateQueueRef = useRef(new Map()); // Buffers candidates until remoteDescription is set
  const localStreamRef = useRef(null);

  // Interactive panels
  const [activePanel, setActivePanel] = useState('none'); // 'none' | 'chat' | 'participants'
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  // Raise hand (STUDENTS ONLY)
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]);

  // Live Attendance stats (for student and teacher display)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [studentStats, setStudentStats] = useState({
    totalSecondsAttended: 0,
    attendancePercentage: 0,
    attendedEightyPercent: false
  });
  const [participantsList, setParticipantsList] = useState([]);

  // Confirmation modals
  const [showEndModal, setShowEndModal] = useState(false);
  const [endingClass, setEndingClass] = useState(false);
  const [endSummary, setEndSummary] = useState(null);

  // Refs for tracking and intervals
  const localVideoRef = useRef(null);
  const lastSignalTimeRef = useRef(0);
  const chatScrollRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const signalIntervalRef = useRef(null);

  const activeLocalStream = isScreenSharing && screenStream ? screenStream : localStream;

  // Ensure local video element gets stream attached whenever activeLocalStream or loading changes
  useEffect(() => {
    if (localVideoRef.current && activeLocalStream) {
      if (localVideoRef.current.srcObject !== activeLocalStream) {
        localVideoRef.current.srcObject = activeLocalStream;
      }
      localVideoRef.current.play().catch(e => console.warn('Local video play warning:', e));
    }
  }, [activeLocalStream, loading, isVideoOn, isScreenSharing]);

  // Student fallback ping if no remote faculty stream is detected within 2.5s of joining
  useEffect(() => {
    if (!isTeacher && !loading) {
      const timer = setTimeout(() => {
        if (Object.keys(remoteStreams).length === 0) {
          api.sendOnlineClassSignal(classId, {
            type: 'request-offer',
            payload: { role: user.role, name: user.name }
          }).catch(() => {});
        }
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [loading, isTeacher, Object.keys(remoteStreams).length, classId]);

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Initialize Room & Media
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        // 1. Join room on server
        const joinRes = await api.joinOnlineClass(classId);
        if (!mounted) return;
        setClassInfo(joinRes.onlineClass || joinRes.session);
        setChatMessages(joinRes.onlineClass?.chatMessages || joinRes.session?.chatMessages || []);
        setRaisedHands(joinRes.onlineClass?.raisedHands || joinRes.session?.raisedHands || []);
        setParticipantsList(joinRes.onlineClass?.participants || joinRes.session?.participants || []);

        // 2. Start local user media
        await initLocalMedia();

        // 3. Notify peers that we joined
        await api.sendOnlineClassSignal(classId, {
          type: 'user-joined',
          payload: { role: user.role, name: user.name }
        });

        // If teacher, initiate call to any participants already in room
        const activeParts = joinRes.onlineClass?.participants || joinRes.session?.participants || [];
        if (isTeacher && activeParts.length > 0) {
          for (const p of activeParts) {
            const pId = (p.student?._id || p.student || '').toString();
            if (pId && pId !== user._id.toString()) {
              setTimeout(() => {
                initiateCallToPeer(pId, p.name, 'student');
              }, 400);
            }
          }
        }

        // 4. Start heartbeat and fast signal polling loops
        startHeartbeatLoop();
        startSignalLoop();
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to init online class:', err);
        setError(err.message || 'Unable to join the online class room.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [classId]);

  // Clean up all tracks and connections on unmount
  const cleanup = () => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    if (signalIntervalRef.current) clearInterval(signalIntervalRef.current);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
    }
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    iceCandidateQueueRef.current.clear();
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Camera & Microphone Setup
  // ───────────────────────────────────────────────────────────────────────────
  const initLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } },
        audio: true
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Add tracks to any existing peer connections
      peerConnectionsRef.current.forEach(pc => {
        stream.getTracks().forEach(track => {
          try { pc.addTrack(track, stream); } catch (e) {}
        });
      });
    } catch (err) {
      console.warn('Camera/Mic permission denied or unavailable:', err);
      setStreamError('Microphone or Camera access was denied or not found. You can still participate in audio/chat.');
      // Attempt audio-only fallback
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioOnly;
        setLocalStream(audioOnly);
        setIsVideoOn(false);
      } catch (audioErr) {
        setIsMicOn(false);
        setIsVideoOn(false);
      }
    }
  };

  // Toggle Mic
  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
    }
  };

  // Toggle Camera
  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOn(videoTrack.enabled);
    }
  };

  // Toggle Screen Sharing (TEACHER ONLY)
  const toggleScreenShare = async () => {
    if (!isTeacher) return; // Prevent student screen share

    if (isScreenSharing) {
      // Stop screen share, switch back to camera
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        setScreenStream(null);
      }
      setIsScreenSharing(false);
      if (localStreamRef.current && localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      // Replace track on existing peer connections
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) {
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(camTrack);
        });
      }
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(screen);
        setIsScreenSharing(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screen;
        }

        const screenTrack = screen.getVideoTracks()[0];
        screenTrack.onended = () => {
          toggleScreenShare();
        };

        // Replace video track in peer connections with screen track
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });
      } catch (err) {
        console.warn('Screen share cancelled or failed:', err);
      }
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Robust Peer Connection Management with ICE Buffering
  // ───────────────────────────────────────────────────────────────────────────
  const drainIceCandidates = async (peerId, pc) => {
    const queue = iceCandidateQueueRef.current.get(peerId);
    if (queue && queue.length > 0 && pc && pc.remoteDescription) {
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('Drain candidate err:', e);
        }
      }
      iceCandidateQueueRef.current.delete(peerId);
    }
  };

  const getOrCreatePeerConnection = (peerId, peerName, peerRole) => {
    if (peerConnectionsRef.current.has(peerId)) {
      return peerConnectionsRef.current.get(peerId);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Add local tracks to this peer connection
    const currentStream = screenStream || localStreamRef.current;
    if (currentStream) {
      currentStream.getTracks().forEach(track => {
        try { pc.addTrack(track, currentStream); } catch (e) {}
      });
    }

    // Handle incoming remote stream tracks
    pc.ontrack = (event) => {
      let stream = event.streams && event.streams[0];
      if (!stream) {
        stream = new MediaStream();
      }
      if (event.track && !stream.getTracks().some(t => t.id === event.track.id)) {
        stream.addTrack(event.track);
      }

      setRemoteStreams(prev => {
        const existing = prev[peerId]?.stream;
        let finalStream = stream;
        if (existing) {
          if (event.track && !existing.getTracks().some(t => t.id === event.track.id)) {
            existing.addTrack(event.track);
          }
          finalStream = new MediaStream(existing.getTracks());
        }
        return {
          ...prev,
          [peerId]: {
            stream: finalStream,
            name: peerName || prev[peerId]?.name || 'Participant',
            role: peerRole || prev[peerId]?.role || 'student',
            version: Date.now()
          }
        };
      });
    };

    // Send ICE candidates to peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        api.sendOnlineClassSignal(classId, {
          to: peerId,
          type: 'ice-candidate',
          payload: { candidate: event.candidate }
        }).catch(e => console.warn('ICE candidate send err:', e));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn(`Peer ${peerId} connection disconnected/failed.`);
        if (isTeacher) {
          initiateCallToPeer(peerId, peerName, peerRole);
        }
      }
    };

    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  };

  // Initiate call to a joined peer (Teacher offers to Students)
  const initiateCallToPeer = async (peerId, peerName, peerRole) => {
    try {
      const pc = getOrCreatePeerConnection(peerId, peerName, peerRole);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await api.sendOnlineClassSignal(classId, {
        to: peerId,
        type: 'offer',
        payload: { sdp: offer, senderRole: user.role, senderName: user.name }
      });
    } catch (err) {
      console.warn('Failed to create offer for peer:', peerId, err);
    }
  };

  // Handle incoming signals from other peers
  const handleIncomingSignal = async (sig) => {
    const { from, fromName, type, payload } = sig;

    switch (type) {
      case 'user-joined': {
        if (isTeacher) {
          await initiateCallToPeer(from, fromName, payload?.role);
        } else if (payload?.role === 'teacher') {
          // If teacher joined, notify them we are ready
          await api.sendOnlineClassSignal(classId, {
            to: from,
            type: 'user-joined',
            payload: { role: user.role, name: user.name }
          });
        }
        break;
      }

      case 'request-offer': {
        if (isTeacher) {
          await initiateCallToPeer(from, fromName, payload?.role || 'student');
        }
        break;
      }

      case 'offer': {
        try {
          const pc = getOrCreatePeerConnection(from, fromName, payload?.senderRole);
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await drainIceCandidates(from, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await api.sendOnlineClassSignal(classId, {
            to: from,
            type: 'answer',
            payload: { sdp: answer, senderRole: user.role, senderName: user.name }
          });
        } catch (err) {
          console.warn('Error handling offer from peer:', from, err);
        }
        break;
      }

      case 'answer': {
        try {
          const pc = peerConnectionsRef.current.get(from);
          if (pc && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await drainIceCandidates(from, pc);
          }
        } catch (err) {
          console.warn('Error handling answer from peer:', from, err);
        }
        break;
      }

      case 'ice-candidate': {
        const pc = peerConnectionsRef.current.get(from);
        if (payload?.candidate) {
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (err) {
              console.warn('Error adding ICE candidate:', err);
            }
          } else {
            // Buffer candidate until remote description is set
            if (!iceCandidateQueueRef.current.has(from)) {
              iceCandidateQueueRef.current.set(from, []);
            }
            iceCandidateQueueRef.current.get(from).push(payload.candidate);
          }
        }
        break;
      }

      case 'chat-message': {
        setChatMessages(prev => [...prev, payload]);
        if (activePanel !== 'chat') {
          setUnreadChatCount(prev => prev + 1);
        }
        break;
      }

      case 'hand-raised': {
        if (payload.isRaised) {
          setRaisedHands(prev => {
            if (prev.some(h => h.studentId === payload.studentId)) return prev;
            return [...prev, { studentId: payload.studentId, studentName: payload.studentName, raisedAt: new Date() }];
          });
        } else {
          setRaisedHands(prev => prev.filter(h => h.studentId !== payload.studentId));
        }
        break;
      }

      case 'class-ended': {
        cleanup();
        if (onClassEnded) onClassEnded(payload);
        break;
      }

      default:
        break;
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Fast Polling Signal Loop (900ms for swift SDP handshake)
  // ───────────────────────────────────────────────────────────────────────────
  const startSignalLoop = () => {
    signalIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.getOnlineClassSignals(classId, lastSignalTimeRef.current);
        if (res.signals && res.signals.length > 0) {
          for (const sig of res.signals) {
            await handleIncomingSignal(sig);
            if (sig.timestamp > lastSignalTimeRef.current) {
              lastSignalTimeRef.current = sig.timestamp;
            }
          }
        }
      } catch (err) {
        // Silent poll error
      }
    }, 900);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Heartbeat & Live 80% Attendance Tracking
  // ───────────────────────────────────────────────────────────────────────────
  const startHeartbeatLoop = () => {
    sendHeartbeatPing();
    heartbeatIntervalRef.current = setInterval(sendHeartbeatPing, 7000);
  };

  const sendHeartbeatPing = async () => {
    try {
      const res = await api.pingOnlineClassHeartbeat(classId, 7);
      if (res.classStatus === 'ended') {
        cleanup();
        if (onClassEnded) onClassEnded();
        return;
      }

      if (res.elapsedSeconds) setElapsedSeconds(res.elapsedSeconds);
      if (res.studentStats) setStudentStats(res.studentStats);
      if (res.raisedHands) setRaisedHands(res.raisedHands);

      // Refresh participant list metadata
      const details = await api.getOnlineClassById(classId);
      const parts = details.onlineClass?.participants || details.session?.participants;
      if (parts) {
        setParticipantsList(parts);
      }
    } catch (err) {
      console.warn('Heartbeat ping error:', err);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Chat and Hand Raise Actions
  // ───────────────────────────────────────────────────────────────────────────
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;

    const text = chatInput.trim();
    setChatInput('');

    try {
      const res = await api.sendOnlineClassMessage(classId, text);
      if (res.chatMessage) {
        setChatMessages(prev => [...prev, res.chatMessage]);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  useEffect(() => {
    if (activePanel === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, activePanel]);

  // Raise hand (STUDENTS ONLY)
  const toggleRaiseHand = async () => {
    if (isTeacher) return;
    try {
      const res = await api.toggleOnlineClassRaiseHand(classId);
      setIsHandRaised(res.isRaised);
      if (res.raisedHands) setRaisedHands(res.raisedHands);
    } catch (err) {
      console.error('Failed to toggle hand raise:', err);
    }
  };

  const lowerStudentHand = async (studentId) => {
    try {
      const res = await api.lowerOnlineClassHand(classId, studentId);
      if (res.raisedHands) setRaisedHands(res.raisedHands);
    } catch (err) {
      console.error('Failed to lower hand:', err);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 7. End Class (Teacher) & Leave Class (Student)
  // ───────────────────────────────────────────────────────────────────────────
  const handleEndClass = async () => {
    try {
      setEndingClass(true);
      const res = await api.endOnlineClass(classId);
      cleanup();
      setEndSummary(res.summary);
      if (onClassEnded) onClassEnded(res.summary);
    } catch (err) {
      alert('Error ending class: ' + err.message);
      setEndingClass(false);
    }
  };

  const handleStudentLeave = () => {
    const confirmed = window.confirm(
      studentStats.attendancePercentage < 80
        ? `⚠️ Warning: You have attended ${studentStats.attendancePercentage}% of this class. The minimum required attendance is 80%. If you leave now, you may be marked ABSENT. Are you sure you want to leave?`
        : 'Are you sure you want to leave the live class session?'
    );
    if (confirmed) {
      cleanup();
      if (onLeave) onLeave();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center bg-[#040d1a] text-white p-6 rounded-3xl border border-[#133966]">
        <div className="w-12 h-12 rounded-2xl border-4 border-[#00C49F] border-t-transparent animate-spin mb-4" />
        <h3 className="text-base font-bold">Connecting to Live Online Class...</h3>
        <p className="text-xs text-slate-400 mt-1">Establishing real-time audio & video media stream</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-[#071b34] text-white rounded-3xl border border-rose-500/40 text-center max-w-lg mx-auto my-12">
        <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold">Class Connection Failed</h3>
        <p className="text-xs text-slate-300 mt-2">{error}</p>
        <button
          onClick={onLeave}
          className="mt-6 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-all"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[88vh] min-h-[580px] bg-[#020813] text-white rounded-2xl sm:rounded-3xl border border-[#133966] overflow-hidden flex flex-col shadow-2xl">
      
      {/* ── Top Bar: Class info, Live badge, 80% Attendance progress ─────────── */}
      <div className="shrink-0 h-16 bg-[#040d1a]/95 backdrop-blur-md border-b border-[#133966] px-3 sm:px-6 flex items-center justify-between gap-2 z-20">
        
        {/* Left: Class details */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 text-[10px] sm:text-xs font-black tracking-wider uppercase shrink-0">
            <Radio className="w-3 sm:w-3.5 h-3 sm:h-3.5 animate-pulse text-rose-500" />
            LIVE
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-base font-extrabold text-white truncate flex items-center gap-1.5 sm:gap-2">
              <span className="truncate">{classInfo?.title || 'Live Online Class'}</span>
              <span className="text-[10px] sm:text-[11px] font-mono font-bold px-1.5 sm:px-2 py-0.5 rounded-md bg-[#00a896]/20 text-[#00C49F] border border-[#00a896]/40 shrink-0">
                Div {classInfo?.division}
              </span>
            </h2>
            <p className="text-[10px] sm:text-[11px] text-cyan-200/70 truncate hidden sm:block">
              {classInfo?.courseCode} · Faculty: {classInfo?.teacherName}
            </p>
          </div>
        </div>

        {/* Center / Right: Real-time Attendance & Elapsed Timer */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          
          {/* Class duration timer */}
          <div className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl bg-[#071b34] border border-[#133966] text-[11px] sm:text-xs font-mono font-bold text-slate-300">
            <Clock className="w-3.5 h-3.5 text-[#00C49F]" />
            <span>{formatTime(elapsedSeconds)}</span>
          </div>

          {/* Student's Live 80% Attendance Eligibility Badge */}
          {!isTeacher && (
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl border text-xs font-bold transition-all ${
              studentStats.attendancePercentage >= 80
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            }`}>
              {studentStats.attendancePercentage >= 80 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Clock className="w-4 h-4 text-amber-400 animate-spin" />
              )}
              <div className="flex flex-col text-left leading-none">
                <span className="text-[10px] uppercase font-mono tracking-wider opacity-80">
                  {studentStats.attendancePercentage >= 80 ? 'Attendance Earned' : '80% Required'}
                </span>
                <span className="font-extrabold text-[11px]">
                  {studentStats.attendancePercentage}% ({formatTime(studentStats.totalSecondsAttended)})
                </span>
              </div>
            </div>
          )}

          {/* Teacher: Connected count */}
          {isTeacher && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-[#071b34] border border-[#133966] text-xs font-bold text-cyan-300">
              <Users className="w-3.5 h-3.5 text-[#00C49F]" />
              <span>{participantsList.length} Connected</span>
            </div>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#071b34] border border-transparent hover:border-[#133966] transition-all"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

      </div>

      {/* ── Main Stage Area: Video Grid + Sidebar Panels ──────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Stream Error alert banner if camera was denied */}
        {streamError && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-md bg-amber-500/90 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shadow-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{streamError}</span>
            <button onClick={() => setStreamError('')} className="ml-auto p-1 text-slate-900 hover:text-black">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Video Grid View (Responsive grid for mobile, tablet, and desktop) */}
        <div className="flex-1 bg-[#020813] p-2 sm:p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 auto-rows-fr">
          
          {/* 1. Local Video Tile (User's own camera/screen) */}
          <div className="relative rounded-2xl bg-[#071b34] border border-[#133966] overflow-hidden flex items-center justify-center min-h-[190px] sm:min-h-[220px] shadow-lg group">
            {isVideoOn || isScreenSharing ? (
              <video
                ref={(el) => {
                  localVideoRef.current = el;
                  if (el && activeLocalStream && el.srcObject !== activeLocalStream) {
                    el.srcObject = activeLocalStream;
                    el.play().catch(e => console.warn('Local video play warning:', e));
                  }
                }}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isScreenSharing ? '' : '-scale-x-100'}`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#040d1a] border-2 border-[#00C49F] flex items-center justify-center text-lg sm:text-xl font-black text-white shadow-md">
                  {user.name?.charAt(0)}
                </div>
                <span className="text-xs font-semibold text-slate-400 mt-2">Camera Off</span>
              </div>
            )}

            {/* Bottom Overlay Label */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
              <div className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-[#040d1a]/85 backdrop-blur-md border border-[#133966] text-[11px] sm:text-xs font-bold text-white flex items-center gap-1.5">
                <span className="truncate max-w-[120px]">{user.name} (You)</span>
                {isTeacher && <span className="text-[9px] px-1 rounded bg-[#00a896]/30 text-[#00C49F]">Host</span>}
                {isHandRaised && !isTeacher && <span className="text-xs">✋</span>}
              </div>
              <div className="flex items-center gap-1">
                {!isMicOn && (
                  <div className="p-1 rounded-md bg-rose-500/80 text-white" title="Muted">
                    <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </div>
                )}
                {isScreenSharing && (
                  <div className="p-1 rounded-md bg-cyan-500/80 text-white" title="Presenting Screen">
                    <ScreenShare className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Remote Video Tiles for Connected Peers */}
          {Object.entries(remoteStreams).map(([peerId, remote]) => (
            <RemoteVideoTile
              key={peerId}
              peerId={peerId}
              remote={remote}
              raisedHands={raisedHands}
            />
          ))}

          {/* Placeholder if waiting for peers */}
          {Object.keys(remoteStreams).length === 0 && (
            <div className="relative rounded-2xl bg-[#040d1a]/70 border border-dashed border-[#133966] p-4 sm:p-6 flex flex-col items-center justify-center text-center">
              <Users className="w-8 h-8 sm:w-10 sm:h-10 text-cyan-400/40 mb-2" />
              <h4 className="text-xs font-bold text-slate-300">
                {isTeacher ? 'Waiting for Division Students to Join...' : 'Connected to Live Session'}
              </h4>
              <p className="text-[10px] sm:text-[11px] text-slate-500 max-w-xs mt-1">
                {isTeacher
                  ? `Students of Division ${classInfo?.division} can now see the live lecture alert and connect.`
                  : 'Faculty media feed is synchronizing live stream.'}
              </p>
            </div>
          )}

        </div>

        {/* ── Slide-Out Sidebar: Chat Panel or Participants Panel ────────────── */}
        {activePanel !== 'none' && (
          <aside className="w-full sm:w-80 md:w-96 bg-[#040d1a] border-l border-[#133966] flex flex-col z-20 animate-in slide-in-from-right duration-200 absolute sm:relative inset-y-0 right-0">
            
            {/* Panel Header */}
            <div className="h-14 border-b border-[#133966] px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activePanel === 'chat' ? (
                  <>
                    <MessageSquare className="w-4 h-4 text-[#00C49F]" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Live Class Chat</span>
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4 text-[#00C49F]" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Participants ({participantsList.length})
                    </span>
                  </>
                )}
              </div>
              <button
                onClick={() => setActivePanel('none')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#071b34]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel Body: CHAT */}
            {activePanel === 'chat' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div ref={chatScrollRef} className="flex-1 p-3 space-y-3 overflow-y-auto">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      No messages yet. Send a message to start the lecture discussion!
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-2xl text-xs space-y-1 ${
                          msg.senderId === user._id
                            ? 'bg-[#00a896]/20 border border-[#00a896]/40 ml-6 text-white'
                            : 'bg-[#071b34] border border-[#133966] mr-6 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span className="font-bold flex items-center gap-1 text-[#00C49F]">
                            {msg.senderName}
                            {msg.senderRole === 'teacher' && (
                              <span className="px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[9px] uppercase">
                                Faculty
                              </span>
                            )}
                          </span>
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed break-words">{msg.message}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Chat Input Bar */}
                <form onSubmit={handleSendMessage} className="p-3 border-t border-[#133966] bg-[#071b34] flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message to class..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#040d1a] border border-[#133966] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#00C49F]"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="p-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] disabled:opacity-40 hover:scale-105 transition-all shadow-md font-bold"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* Panel Body: PARTICIPANTS & ATTENDANCE STATUS */}
            {activePanel === 'participants' && (
              <div className="flex-1 p-3 overflow-y-auto space-y-2">
                
                {/* Raised Hands Section (Teacher can lower student hands) */}
                {raisedHands.length > 0 && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-3 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                      <Hand className="w-3.5 h-3.5 text-amber-400" />
                      Raised Hands ({raisedHands.length})
                    </span>
                    {raisedHands.map((rh, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-[#040d1a]">
                        <span className="font-bold text-white">{rh.studentName}</span>
                        {isTeacher && (
                          <button
                            onClick={() => lowerStudentHand(rh.studentId)}
                            className="text-[10px] text-amber-400 hover:text-white underline font-semibold"
                          >
                            Lower Hand
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* All Participants with Live 80% indicator */}
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider px-1">
                  Enrolled Students (Division {classInfo?.division})
                </div>

                {participantsList.map((p, idx) => {
                  const currentPercent = elapsedSeconds > 0
                    ? Math.min(100, Math.round(((p.totalSecondsAttended || 0) / elapsedSeconds) * 100))
                    : 0;
                  const isEligible = currentPercent >= 80;

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-[#071b34] border border-[#133966] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-white truncate flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {raisedHands.some(h => h.studentId === p.student) && <span>✋</span>}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          {p.usn} · Attended: {formatTime(p.totalSecondsAttended || 0)}
                        </div>
                      </div>

                      {/* 80% Threshold Status Pill */}
                      <div className="shrink-0 text-right">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                          isEligible
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        }`}>
                          {currentPercent}% {isEligible ? '✓' : ''}
                        </span>
                        <span className="block text-[9px] text-slate-400 mt-0.5">
                          {isEligible ? 'Eligible' : '<80%'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </aside>
        )}

      </div>

      {/* ── Bottom Control Dock: All Buttons & Interactive Functions ─────────── */}
      <div className="shrink-0 h-18 sm:h-20 bg-[#040d1a] border-t border-[#133966] px-3 sm:px-6 flex items-center justify-between gap-2 z-20">
        
        {/* Left: Division & Live Status indicator */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00C49F] animate-ping" />
          <span>Live Connected · Div {classInfo?.division}</span>
        </div>

        {/* Center: Essential Controls */}
        <div className="flex items-center gap-2 sm:gap-3 mx-auto">
          
          {/* Mic Toggle Button */}
          <button
            onClick={toggleMic}
            className={`p-2.5 sm:p-3 rounded-2xl border transition-all ${
              isMicOn
                ? 'bg-[#071b34] hover:bg-[#0b2444] border-[#133966] text-white hover:border-[#00C49F]'
                : 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/40 text-rose-400'
            }`}
            title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {isMicOn ? <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-[#00C49F]" /> : <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {/* Camera Toggle Button */}
          <button
            onClick={toggleCamera}
            className={`p-2.5 sm:p-3 rounded-2xl border transition-all ${
              isVideoOn
                ? 'bg-[#071b34] hover:bg-[#0b2444] border-[#133966] text-white hover:border-[#00C49F]'
                : 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/40 text-rose-400'
            }`}
            title={isVideoOn ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {isVideoOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5 text-[#00C49F]" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {/* Screen Share Button - TEACHER ONLY (PER REQUIREMENT: students cannot share screen) */}
          {isTeacher && (
            <button
              onClick={toggleScreenShare}
              className={`p-2.5 sm:p-3 rounded-2xl border transition-all ${
                isScreenSharing
                  ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-lg shadow-cyan-500/20'
                  : 'bg-[#071b34] hover:bg-[#0b2444] border-[#133966] text-white hover:border-[#00C49F]'
              }`}
              title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen (Faculty Only)'}
            >
              <ScreenShare className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          {/* Raise Hand Button - STUDENTS ONLY (PER REQUIREMENT: removed for teacher) */}
          {!isTeacher && (
            <button
              onClick={toggleRaiseHand}
              className={`relative p-2.5 sm:p-3 rounded-2xl border transition-all ${
                isHandRaised
                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 scale-105 shadow-lg shadow-amber-500/20'
                  : 'bg-[#071b34] hover:bg-[#0b2444] border-[#133966] text-white hover:border-amber-400'
              }`}
              title={isHandRaised ? 'Lower Hand' : 'Raise Hand'}
            >
              <Hand className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          {/* Live Chat Panel Toggle */}
          <button
            onClick={() => {
              setActivePanel(prev => prev === 'chat' ? 'none' : 'chat');
              setUnreadChatCount(0);
            }}
            className={`relative p-2.5 sm:p-3 rounded-2xl border transition-all ${
              activePanel === 'chat'
                ? 'bg-[#00a896]/20 border-[#00C49F] text-[#00C49F]'
                : 'bg-[#071b34] hover:bg-[#0b2444] border-[#133966] text-white hover:border-[#00C49F]'
            }`}
            title="Open Live Chat"
          >
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#00C49F] text-slate-950 text-[10px] font-black flex items-center justify-center animate-bounce">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Participants Panel Toggle (Shows raised hands counter badge to teacher) */}
          <button
            onClick={() => setActivePanel(prev => prev === 'participants' ? 'none' : 'participants')}
            className={`relative p-2.5 sm:p-3 rounded-2xl border transition-all ${
              activePanel === 'participants'
                ? 'bg-[#00a896]/20 border-[#00C49F] text-[#00C49F]'
                : 'bg-[#071b34] hover:bg-[#0b2444] border-[#133966] text-white hover:border-[#00C49F]'
            }`}
            title="View Participants & Attendance Status"
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            {raisedHands.length > 0 && isTeacher && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center animate-bounce" title={`${raisedHands.length} student(s) raised hand`}>
                ✋{raisedHands.length}
              </span>
            )}
          </button>

        </div>

        {/* Right: End Class (Teacher) or Leave Class (Student) */}
        <div className="flex items-center gap-2">
          {isTeacher ? (
            <button
              onClick={() => setShowEndModal(true)}
              className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-rose-600/30 transition-all hover:scale-105"
            >
              <PhoneOff className="w-4 h-4" />
              <span className="hidden sm:inline">End Class & Record Attendance</span>
              <span className="sm:hidden">End</span>
            </button>
          ) : (
            <button
              onClick={handleStudentLeave}
              className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all"
            >
              <PhoneOff className="w-4 h-4" />
              <span className="hidden sm:inline">Leave Class</span>
              <span className="sm:hidden">Leave</span>
            </button>
          )}
        </div>

      </div>

      {/* ── Modal: Teacher End Class Confirmation & 80% Rule Summary ────────── */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-[#040d1a]/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#071b34] border border-[#133966] rounded-3xl p-6 shadow-2xl text-white space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-[#00C49F]" />
            </div>

            <div>
              <h3 className="text-lg font-black text-white">End Class & Finalize Attendance?</h3>
              <p className="text-xs text-slate-300 mt-1">
                This will terminate the live session and automatically record attendance in the official database
                for Division <strong className="text-white">{classInfo?.division}</strong>.
              </p>
            </div>

            {/* 80% Threshold Rule Explainer */}
            <div className="p-3 rounded-2xl bg-[#040d1a] border border-[#133966] space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Class Duration:</span>
                <span className="font-bold text-white font-mono">{formatTime(elapsedSeconds)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Rule Applied:</span>
                <span className="font-bold text-[#00C49F]">80% Attendance Threshold</span>
              </div>
              <p className="text-[11px] text-cyan-200/80 pt-1 border-t border-[#133966]">
                Students who stayed for at least 80% of this duration will be automatically marked <strong className="text-emerald-400">Present</strong>.
                Students with less than 80% attendance will be marked <strong className="text-rose-400">Absent</strong>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                disabled={endingClass}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndClass}
                disabled={endingClass}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2"
              >
                {endingClass ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Recording Attendance...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm & Record Attendance
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Class Summary Report after Ended ─────────────────────────── */}
      {endSummary && (
        <div className="fixed inset-0 z-50 bg-[#040d1a]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#071b34] border border-[#00C49F] rounded-3xl p-6 shadow-2xl text-white space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#00a896]/20 border border-[#00a896]/40 text-[#00C49F] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-[#00C49F]" />
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-white">Attendance Recorded Successfully!</h3>
              <p className="text-xs text-slate-300 mt-1">
                Official attendance session generated and saved to MongoDB.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-[#040d1a] border border-[#133966] text-xs">
              <div>
                <span className="block text-slate-400 text-[10px]">Total</span>
                <span className="font-extrabold text-base text-white">{endSummary.totalEnrolled}</span>
              </div>
              <div>
                <span className="block text-emerald-400 text-[10px]">Present (≥80%)</span>
                <span className="font-extrabold text-base text-emerald-300">{endSummary.totalPresent}</span>
              </div>
              <div>
                <span className="block text-rose-400 text-[10px]">Absent (&lt;80%)</span>
                <span className="font-extrabold text-base text-rose-300">{endSummary.totalAbsent}</span>
              </div>
            </div>

            <button
              onClick={onLeave}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] text-[#040d1a] font-black text-xs shadow-lg transition-all"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
