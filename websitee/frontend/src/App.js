// Force redeploy - Latest QR scanner with enhanced focus capabilities
import React, { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import './App.css';

const timetable = [
  {
    id: 1,
    course: "Artificial Intelligence and Machine Learning(CSET301)",
    location: "(102-N-LH)",
    time: "03:30 PM - 04:30 PM (60 min)",
    instructor: "Rohit Kumar Kaliyar",
    room: "102-N-LH"
  },
  {
    id: 2,
    course: "Automata Theory and Computability",
    location: "(101-N-LH)",
    time: "04:30 PM - 05:30 PM (60 min)",
    instructor: "Ashish Kumar",
    room: "101-N-LH"
  },
  {
    id: 3,
    course: "Soft Computing",
    location: "(104-N-LH)",
    time: "02:30 PM - 03:30 PM (60 min)",
    instructor: "Mahadev Ajagalla",
    room: "104-N-LH"
  },
  {
    id: 4,
    course: "Web Technologies(CSET382)",
    location: "(P-LH-102)",
    time: "12:30 PM - 01:30 PM (60 min)",
    instructor: "Anant Saraswat",
    room: "P-LH-102"
  },
  {
    id: 5,
    course: "High Performance Computing(CSET305-P)",
    location: "(B-LA-207)",
    time: "10:30 AM - 11:30 AM (60 min)",
    instructor: "Dummy Faculty SEAS",
    room: "B-LA-207"
  },
  {
    id: 6,
    course: "High Performance Computing(CSET305-P)",
    location: "(B-LA-207)",
    time: "11:30 AM - 12:30 PM (60 min)",
    instructor: "Dummy Faculty SEAS",
    room: "B-LA-207"
  }
];

// Simple decryption function

const decryptData = (encryptedData) => {
  try {
    return decodeURIComponent(atob(encryptedData));
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedData;
  }
};

function App() {
  const [users, setUsers] = useState([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [attendanceResults, setAttendanceResults] = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const videoRef = useRef(null);
  const codeReader = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const zxingCoreRef = useRef(null);
  const [showQRScannedPopup, setShowQRScannedPopup] = useState(false);
  const [userCookies, setUserCookies] = useState([]);
  const [showAddUserButton, setShowAddUserButton] = useState(false);
  const dateTapCountRef = useRef(0);
  const [scanningHint, setScanningHint] = useState('');
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [scanAttempts, setScanAttempts] = useState(0);
  const [cameraStatus, setCameraStatus] = useState('initializing');
  const [scannerSwitchAttempts, setScannerSwitchAttempts] = useState(0);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [scanProgress, setScanProgress] = useState({ completed: 0, total: 0 });
  const isReadyToScan = users.length > 0 && userCookies.length === users.length && userCookies.every(Boolean);

  // Load users and cookies on mount (fast path)
  useEffect(() => {
    console.log('🔄 Loading users and cookies...');
    const loadFast = async () => {
      try {
        const fastRes = await fetch('/api/users-and-cookies', { cache: 'no-store' });
        if (fastRes.ok) {
          const data = await fastRes.json();
          const fastUsers = data.map((u, idx) => ({
            id: Date.now() + idx,
            email: u.email,
            name: u.name,
            stuId: u.stuId,
            password: ''
          }));
          setUsers(fastUsers);
          setUserCookies(data.map((u) => u.cookie));
          return;
        }
        console.warn('Fast path failed, falling back to users-for-frontend + get-cookie');
        const response = await fetch('/api/users-for-frontend', { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed users-for-frontend');
        const supabaseUsers = await response.json();
        const decryptedUsers = supabaseUsers.map(user => ({
          ...user,
          password: decryptData(user.password)
        }));
        setUsers(decryptedUsers);
        const cookies = await Promise.all(decryptedUsers.map(user => getFreshCookieForUser(user)));
        setUserCookies(cookies);
      } catch (error) {
        console.error('❌ Error loading users from Supabase:', error);
      }
    };
    
    loadFast();
  }, []);

  useEffect(() => {
    // Key combo listener for admin
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        setShowAddUserButton(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (codeReader.current) {
        codeReader.current.reset();
      }
      const videoElement = videoRef.current;
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  const addUser = async (email, password) => {
    console.log('➕ Adding new user...');
    setLoading(true);
    try {
      console.log('🌐 Making login request...');
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      console.log('📡 Login response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Login successful, user data:', { name: data.name, stuId: data.stuId });
        
        const newUser = {
          id: Date.now(),
          email: email,
          password: password,
          name: data.name,
          stuId: data.stuId
        };
        
        console.log('👤 Created new user object:', { name: newUser.name, stuId: newUser.stuId });
        
        // User is already saved to Supabase by the backend
        // Just update the local state
        setUsers(prevUsers => [...prevUsers, newUser]);
        console.log('✅ User added to system (saved in Supabase)');
        setShowAddUser(false);
      } else {
        console.error('❌ Login failed:', response.status, response.statusText);
        alert('Login failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('💥 Error adding user:', error);
      alert('Error adding user. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getFreshCookieForUser = async (user) => {
    try {
      const response = await fetch('/api/get-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.password
        })
      });
      if (response.ok) {
        const data = await response.json();
        console.log('🍪 Received cookie');
        return data.cookie;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  };

  // In openCamera, set high-res constraints
  const openCamera = () => {
    console.log('📷 Opening camera...');
    setIsCameraOpen(true);
    setAttendanceResults([]);
    setScanningHint('Initializing camera...');
    setScanAttempts(0);
    setCameraStatus('initializing');
    setTimeout(() => {
      startScanner();
    }, 300);
  };

  const closeCamera = () => {
    console.log('📷 Closing camera...');
    setIsCameraOpen(false);
    setCameraStatus('closed');
    stopScanner();
  };

  const startScanner = () => {
    if (!videoRef.current) {
      console.error('❌ Video ref not available');
      setScanningHint('Camera initialization failed');
      setCameraStatus('error');
      return;
    }
    
    console.log('🔍 Initializing QR scanner...');
    setCameraStatus('starting');
    startZxingScanner();
  };

  const startZxingScanner = () => {
    console.log('📱 Starting Enhanced ZXing QR Scanner...');
    
    // Proper ZXing hints focusing on QR with robustness
    const formats = [BarcodeFormat.QR_CODE];
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(DecodeHintType.TRY_HARDER, true);
    // Inverted helps with dark/bright projector backgrounds
    hints.set(DecodeHintType.ALSO_INVERTED, true);

    codeReader.current = new BrowserMultiFormatReader(hints);
    
    // Simplified camera constraints to prevent black screen
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        frameRate: { ideal: 30, min: 15 }
      }
    };
    
    // First get the video stream
    navigator.mediaDevices.getUserMedia(constraints).then(async (stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Try to enable continuous focus/exposure where available
        try {
          const [track] = stream.getVideoTracks();
          if (track && typeof track.getCapabilities === 'function') {
            const capabilities = track.getCapabilities();
            const advanced = [];
            if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
              advanced.push({ focusMode: 'continuous' });
            }
            if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
              advanced.push({ exposureMode: 'continuous' });
            }
            if (advanced.length) {
              await track.applyConstraints({ advanced });
            }
          }
        } catch {}

        videoRef.current.play().then(() => {
          console.log('✅ Video stream started successfully');
          setCameraStatus('active');
          setScanningHint('Camera ready. Position QR code in frame');
        }).catch(err => {
          console.error('❌ Video play failed:', err);
          setCameraStatus('error');
          setScanningHint('Camera failed to start');
        });
      }
      
      // Start the scanner
      codeReader.current.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
        if (result) {
          console.log('🎯 QR Code detected by ZXing!');
          console.log('📄 QR Data:', result.getText());
          console.log('📊 Format:', result.getFormat());
          setScanningHint('QR Code detected! Processing...');
          setCameraStatus('scanning');
          handleQRScan(result.getText());
          closeCamera();
        } else if (err && err.name !== 'NotFoundException') {
           // still scanning
          setScanAttempts(prev => prev + 1);
          setScannerSwitchAttempts(prev => prev + 1);
          
          // Auto-adjust settings based on scan attempts
          handleScanAttempts();
          
          // Restart scanner if too many attempts
          if (scannerSwitchAttempts > 30) {
            console.log('🔄 Restarting ZXing scanner...');
            setScannerSwitchAttempts(0);
            setScanAttempts(0);
            stopScanner();
            setTimeout(() => {
              startZxingScanner();
            }, 1000);
          }

          // Fallback: try BarcodeDetector for skewed/low-contrast codes
          if ('BarcodeDetector' in window && !barcodeDetectorRef.current && scannerSwitchAttempts > 8) {
            console.log('🧪 Starting BarcodeDetector fallback');
            startBarcodeDetectorFallback();
          }
          // Attempt CDN ZXing-core frame decode first for tough cases
          if (scannerSwitchAttempts === 14) {
            setScanningHint('Trying enhanced decode...');
            tryZXingCoreDecodeOnce().then((text) => {
              if (text) {
                console.log('🎯 QR Code decoded via ZXing core');
                setScanningHint('QR Code detected! Processing...');
                setCameraStatus('scanning');
                handleQRScan(text);
                closeCamera();
              }
            });
          }
          // Last resort after many attempts: single server-side decode
          if (scannerSwitchAttempts === 20) {
            setScanningHint('Trying server-side decode...');
            tryServerSideDecodeOnce().then((text) => {
              if (text) {
                console.log('🎯 QR Code decoded on server');
                setScanningHint('QR Code detected! Processing...');
                setCameraStatus('scanning');
                handleQRScan(text);
                closeCamera();
              }
            });
          }
        }
      });
    }).catch(err => {
      console.error('❌ Failed to get camera stream:', err);
      setCameraStatus('error');
      setScanningHint('Camera access failed. Trying basic mode...');
      
      // Try with basic constraints
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            console.log('✅ Basic video stream started');
            setCameraStatus('active');
            setScanningHint('Camera ready (basic mode)');
          }).catch(err => {
            console.error('❌ Basic video play failed:', err);
            setCameraStatus('error');
            setScanningHint('Camera failed to start');
          });
        }
        codeReader.current.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
          if (result) {
            console.log('🎯 QR Code detected by ZXing!');
            console.log('📄 QR Data:', result.getText());
            setScanningHint('QR Code detected! Processing...');
            setCameraStatus('scanning');
            handleQRScan(result.getText());
            closeCamera();
          }
        });
      }).catch(fallbackErr => {
        console.error('❌ Camera access completely failed:', fallbackErr);
        setCameraStatus('error');
        setScanningHint('Camera access failed. Please check permissions.');
      });
    });
    
    console.log('✅ Enhanced ZXing Scanner started successfully');
  };

  const startBarcodeDetectorFallback = () => {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      barcodeDetectorRef.current = detector;
      const detect = async () => {
        if (!isCameraOpen || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0 && codes[0].rawValue) {
            console.log('🎯 QR Code detected by BarcodeDetector!');
            setScanningHint('QR Code detected! Processing...');
            setCameraStatus('scanning');
            handleQRScan(codes[0].rawValue);
            closeCamera();
            return;
          }
        } catch {}
        requestAnimationFrame(detect);
      };
      requestAnimationFrame(detect);
    } catch (e) {
      console.warn('BarcodeDetector not available:', e);
    }
  };

  // Last-resort: upload a video frame to backend for server-side decoding
  const tryServerSideDecodeOnce = async () => {
    if (!videoRef.current) return null;
    try {
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const res = await fetch('/api/decode-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.text || null;
    } catch {
      return null;
    }
  };

  // Load ZXing core from CDN lazily
  const loadZXingCore = async () => {
    if (zxingCoreRef.current) return zxingCoreRef.current;
    try {
      const mod = await import('https://unpkg.com/@zxing/library@latest?module');
      zxingCoreRef.current = mod;
      return mod;
    } catch (e) {
      console.warn('Failed to load ZXing core from CDN', e);
      return null;
    }
  };

  // Try decoding current frame with ZXing core (handles skew/contrast)
  const tryZXingCoreDecodeOnce = async () => {
    const core = await loadZXingCore();
    if (!core || !videoRef.current) return null;
    const {
      RGBLuminanceSource,
      BinaryBitmap,
      HybridBinarizer,
      MultiFormatReader,
      DecodeHintType,
      BarcodeFormat
    } = core;
    
    const getFrameImageData = (rotateDeg = 0, enhance = true, crop = true) => {
      const video = videoRef.current;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return null;
      const side = crop ? Math.floor(Math.min(vw, vh) * 0.8) : Math.min(vw, vh);
      const sx = Math.floor((vw - side) / 2);
      const sy = Math.floor((vh - side) / 2);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (rotateDeg % 180 === 0) {
        canvas.width = side; canvas.height = side;
      } else {
        canvas.width = side; canvas.height = side;
      }
      ctx.save();
      // Translate to center and rotate, then draw ROI
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotateDeg * Math.PI) / 180);
      ctx.drawImage(video, sx, sy, side, side, -side / 2, -side / 2, side, side);
      ctx.restore();
      let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (enhance) {
        // simple contrast stretch on grayscale
        let min = 255, max = 0;
        for (let i = 0; i < imgData.data.length; i += 4) {
          const r = imgData.data[i], g = imgData.data[i + 1], b = imgData.data[i + 2];
          const y = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
          if (y < min) min = y; if (y > max) max = y;
          imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = y;
        }
        const span = Math.max(1, max - min);
        for (let i = 0; i < imgData.data.length; i += 4) {
          const v = ((imgData.data[i] - min) * 255) / span;
          const vv = v | 0;
          imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = vv;
        }
      }
      return imgData;
    };

    const tryDecode = (imgData) => {
      const luminance = new RGBLuminanceSource(imgData.data, imgData.width, imgData.height);
      const binarizer = new HybridBinarizer(luminance);
      const bitmap = new BinaryBitmap(binarizer);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.ALSO_INVERTED, true);
      const reader = new MultiFormatReader();
      reader.setHints(hints);
      const result = reader.decode(bitmap);
      return result?.getText?.() || result?.text || null;
    };

    const rotations = [0, 90, 180, 270];
    for (const rot of rotations) {
      try {
        const img = getFrameImageData(rot, true, true);
        if (!img) continue;
        const text = tryDecode(img);
        if (text) return text;
      } catch {}
    }
    return null;
  };

  const handleScanAttempts = () => {
    // Auto-adjust settings based on scan attempts
    if (scanAttempts === 5) {
      // First adjustment: increase brightness
      adjustBrightness(1.5);
      setScanningHint('Auto-adjusting brightness...');
    } else if (scanAttempts === 10) {
      // Second adjustment: increase contrast
      adjustContrast(1.5);
      setScanningHint('Auto-adjusting contrast...');
    } else if (scanAttempts === 15) {
      // Third adjustment: maximum brightness
      adjustBrightness(2.0);
      setScanningHint('Auto-adjusting for dim QR...');
    } else if (scanAttempts === 20) {
      // Fourth adjustment: maximum contrast
      adjustContrast(2.0);
      setScanningHint('Auto-adjusting for small QR...');
    } else if (scanAttempts === 25) {
      // Fifth adjustment: reset and try different approach
      adjustBrightness(0.8);
      adjustContrast(1.2);
      setScanningHint('Trying different approach...');
    } else if (scanAttempts < 5) {
      setScanningHint('Scanning with ZXing... Position QR code clearly');
    } else if (scanAttempts < 10) {
      setScanningHint('Try adjusting distance or angle');
    } else if (scanAttempts < 15) {
      setScanningHint('Try zooming in or using flash');
    } else {
      setScanningHint('QR may be too small or dim. Try getting closer');
    }
  };

  const stopScanner = () => {
    console.log('⏹️ Stopping scanner...');
    if (codeReader.current) {
      codeReader.current.reset();
      console.log('✅ ZXing Scanner stopped');
      codeReader.current = null;
    }
    
    // Clean up video stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach(track => {
        track.stop();
        console.log('✅ Video track stopped:', track.kind);
      });
      videoRef.current.srcObject = null;
    }
    
    setCameraStatus('closed');
    setScanningHint('');
  };

  const toggleFlash = async () => {
    console.log('⚡ Toggling flash...');
    try {
      const stream = videoRef.current?.srcObject;
      const track = stream?.getVideoTracks?.()[0];
      const capabilities = track?.getCapabilities?.();
      if (capabilities && capabilities.torch) {
        const next = !isFlashOn;
        await track.applyConstraints({ advanced: [{ torch: next }] });
        setIsFlashOn(next);
        return;
      }
    } catch {}
    // Fallback UI toggle if no torch capability
    setIsFlashOn((v) => !v);
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => {
      const newZoom = Math.min(prev + 0.1, 3);
      applyCameraZoom(newZoom);
      return newZoom;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const newZoom = Math.max(prev - 0.1, 1);
      applyCameraZoom(newZoom);
      return newZoom;
    });
  };

  const applyCameraZoom = (zoom) => {
    if (videoRef.current && videoRef.current.srcObject) {
      const [track] = videoRef.current.srcObject.getVideoTracks();
      if (track && typeof track.getCapabilities === 'function') {
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
          track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
        }
      }
    }
  };

  const adjustBrightness = (value) => {
    setBrightness(value);
    if (videoRef.current) {
      videoRef.current.style.filter = `brightness(${value}) contrast(${contrast})`;
    }
  };

  const adjustContrast = (value) => {
    setContrast(value);
    if (videoRef.current) {
      videoRef.current.style.filter = `brightness(${brightness}) contrast(${value})`;
    }
  };

  // Helper: fetch with timeout and no-store caching
  const fetchWithTimeout = async (resource, options = {}, timeoutMs = 8000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(resource, { ...options, signal: controller.signal, cache: 'no-store' });
      return response;
    } finally {
      clearTimeout(id);
    }
  };

  const handleQRScan = async (qrData) => {
    if (isProcessingScan) return; // prevent duplicate scans while processing
    setShowQRScannedPopup(true);
    setTimeout(() => setShowQRScannedPopup(false), 2000);
    try {
      const attendanceId = qrData;
      const cookies = userCookies;
      if (!users.length) {
        alert('No users loaded yet. Please add users first.');
        return;
      }
      if (!cookies || cookies.length !== users.length) {
        alert('Cookies not loaded yet. Please wait a moment and try again.');
        return;
      }

      setIsProcessingScan(true);
      setScanProgress({ completed: 0, total: users.length });
      // Seed results immediately so UI shows progress
      setAttendanceResults(users.map((u) => ({ name: u.name, status: '⏳ Sending...', code: 'PENDING' })));

      const tasks = users.map((user, i) => (async () => {
        const userCookie = cookies[i];
        if (!userCookie) {
          const failure = { name: user.name, status: '❌ Failed to get session cookie', code: 'COOKIE_ERROR' };
          setAttendanceResults((prev) => {
            const updated = [...prev];
            updated[i] = failure;
            return updated;
          });
          setScanProgress((p) => ({ ...p, completed: p.completed + 1 }));
          return;
        }

        try {
          const response = await fetchWithTimeout('/api/mark-attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stuId: user.stuId, attendanceId, cookie: userCookie })
          }, 9000);
          const data = await response.json().catch(() => ({}));
          const code = data?.output?.data?.code;
          let status = 'Unknown';
          if (code === 'SUCCESS') status = '✅ Marked Present';
          else if (code === 'ATTENDANCE_NOT_VALID') status = '❌ Invalid QR (expired or wrong student)';
          else status = `⚠️ ${code || 'Error'}`;
          const result = { name: user.name, status, code };
          setAttendanceResults((prev) => {
            const updated = [...prev];
            updated[i] = result;
            return updated;
          });
        } catch (e) {
          const errorResult = { name: user.name, status: '❌ Timeout or network error', code: 'TIMEOUT' };
          setAttendanceResults((prev) => {
            const updated = [...prev];
            updated[i] = errorResult;
            return updated;
          });
        } finally {
          setScanProgress((p) => ({ ...p, completed: p.completed + 1 }));
        }
      })());

      await Promise.allSettled(tasks);
    } catch (error) {
      console.error('💥 Error processing QR scan:', error);
    } finally {
      setIsProcessingScan(false);
    }
  };

  const AddUserModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg w-full max-w-sm mx-auto">
        <h2 className="text-xl font-bold mb-4">Add User</h2>
        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          addUser(formData.get('email'), formData.get('password'));
        }}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              name="email"
              required
              className="w-full p-3 border border-gray-300 rounded-lg text-base"
              placeholder="Enter email"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              name="password"
              required
              className="w-full p-3 border border-gray-300 rounded-lg text-base"
              placeholder="Enter password"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 text-base font-medium"
            >
              {loading ? 'Adding...' : 'Add User'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddUser(false)}
              className="flex-1 bg-gray-300 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-400 text-base font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {showQRScannedPopup && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 text-lg font-semibold animate-fade-in">
          QR scanned
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Add User Button */}
        {showAddUserButton && (
          <div className="mb-4">
            <button
              onClick={() => setShowAddUser(true)}
              className="bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 w-full text-base font-medium"
            >
              Add User
            </button>
          </div>
        )}

        {/* Today's Schedule - White Div */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-4">
            {/* Semester Info and Buttons - Above date navigation */}
            <div className="flex flex-col justify-between items-start gap-4 mb-6">
              <div>
                <h1 className="text-xl font-semibold text-gray-800">Timetable</h1>
                <p className="text-sm text-gray-600">Semester - 5 | 2025-2026</p>
              </div>
              <div className="flex gap-2 w-full">
                <button className="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2 text-sm">
                  <span>🔄</span>
                  <span>Refresh</span>
                </button>
                <button className="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 text-sm">
                  Weekly schedule
                </button>
              </div>
            </div>

            {/* Date Navigation - Inside the white div */}
            <div className="flex justify-center items-center gap-4 mb-6">
              <button className="text-gray-600 hover:text-gray-800 p-2">
                <span className="text-xl">‹</span>
              </button>
              <span
                className="text-base font-medium"
                onClick={() => {
                  dateTapCountRef.current += 1;
                  if (dateTapCountRef.current >= 10) {
                    setShowAddUserButton(true);
                    dateTapCountRef.current = 0;
                  }
                }}
              >
                05-Aug-2025
              </span>
              <button className="text-gray-600 hover:text-gray-800 p-2">
                <span className="text-xl">›</span>
              </button>
            </div>

            {/* QR Scanner - Above Today's Schedule */}
            {isCameraOpen && (
              <div className="bg-black rounded-lg shadow-2xl mb-6 transition-all duration-300 w-full">
                <div className="p-4 sm:p-6">
                  <div className="relative">
                    {/* QR Scanner Container for HTML5 */}
                    {/* Removed HTML5 scanner container */}
                    
                    {/* Video element for ZXing */}
                    <video 
                      ref={videoRef} 
                      className="rounded-lg object-cover bg-black transition-all duration-300 h-80 sm:h-96 w-full"
                      autoPlay={true} 
                      muted={true} 
                      playsInline={true}
                    />

                    {/* QR Scanning Frame */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="relative w-full h-full">
                        {/* Red dotted border with L-shaped corners */}
                        <div className="absolute inset-4 border-2 border-red-500 border-dashed">
                          {/* L-shaped corners */}
                          <div className="absolute top-0 left-0 w-6 h-6 border-l-4 border-t-4 border-red-500"></div>
                          <div className="absolute top-0 right-0 w-6 h-6 border-r-4 border-t-4 border-red-500"></div>
                          <div className="absolute bottom-0 left-0 w-6 h-6 border-l-4 border-b-4 border-red-500"></div>
                          <div className="absolute bottom-0 right-0 w-6 h-6 border-r-4 border-b-4 border-red-500"></div>
                        </div>
                      </div>
                    </div>

                    {/* Scanning Hint */}
                    {scanningHint && (
                      <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-2 rounded-lg text-sm">
                        {scanningHint}
                      </div>
                    )}

                    {/* Enhanced Camera Controls */}
                    <div className="absolute bottom-4 right-4 flex flex-col items-center gap-2">
                      {/* Zoom In Button */}
                      <button
                        onClick={handleZoomIn}
                        className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg hover:bg-yellow-500 transition-colors"
                      >
                        <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                          <path fillRule="evenodd" d="M8 6a2 2 0 100 4 2 2 0 000-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-black text-sm font-bold ml-1">+</span>
                      </button>
                      
                      {/* Zoom Level Indicator */}
                      <div className="bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                        {Math.round(zoomLevel * 100)}%
                      </div>
                      
                      {/* Zoom Out Button */}
                      <button
                        onClick={handleZoomOut}
                        className="w-12 h-12 bg-gray-400 rounded-full flex items-center justify-center shadow-lg hover:bg-gray-500 transition-colors"
                      >
                        <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                          <path fillRule="evenodd" d="M8 6a2 2 0 100 4 2 2 0 000-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-black text-sm font-bold ml-1">-</span>
                      </button>
                    </div>

                    {/* Flash Button */}
                    <div className="absolute bottom-4 left-4">
                      <button
                        onClick={toggleFlash}
                        className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors ${
                          isFlashOn ? 'bg-yellow-400 hover:bg-yellow-500' : 'bg-gray-400 hover:bg-gray-500'
                        }`}
                      >
                        <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>

                    {/* Close Button */}
                    <div className="absolute top-4 right-4">
                      <button
                        onClick={closeCamera}
                        className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                      >
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>

                    {/* Scanner Type Indicator */}
                    <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-xs">
                      Scanner: ZXing
                    </div>

                    {/* Camera Status Indicator */}
                    <div className={`absolute top-4 right-16 px-3 py-1 rounded-lg text-xs ${
                      cameraStatus === 'active' ? 'bg-green-500 text-white' :
                      cameraStatus === 'error' ? 'bg-red-500 text-white' :
                      cameraStatus === 'scanning' ? 'bg-blue-500 text-white' :
                      'bg-yellow-500 text-white'
                    }`}>
                      Camera: {cameraStatus}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Today's Schedule Header */}
            <h2 className="text-lg font-semibold mb-4">Today's Schedule</h2>
            
            {/* Course Listings */}
            <div className="space-y-4">
              {timetable.map((course, index) => (
                <div key={course.id} className="border-b border-gray-100 pb-4 last:border-b-0">
                  <div className="flex flex-col justify-between items-start gap-3">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 text-sm">
                        {course.course}{course.location}
                      </h3>
                      <p className="text-gray-600 text-xs">{course.time}</p>
                      <p className="text-gray-600 text-xs">{course.instructor}</p>
                      <p className="text-gray-600 text-xs">{course.room}</p>
                      {index === 1 && (
                        <p className="text-gray-400 text-xs mt-1">Attendance recorded</p>
                      )}
                    </div>
                     {index === 2 && (
                      <button
                        onClick={() => {
                          if (!isReadyToScan) {
                            alert('Users/cookies are still loading. Please wait a moment and try again.');
                            return;
                          }
                          openCamera();
                        }}
                        disabled={!isReadyToScan}
                        className={`px-4 py-3 rounded-lg w-full text-sm font-medium ${
                          isReadyToScan ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        }`}
                      >
                        {isReadyToScan ? 'Record Attendance' : 'Preparing...'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>



        {/* Attendance Results */}
        {attendanceResults.length > 0 && (
          <div className="mt-6 sm:mt-8 mb-20 card bg-white shadow-2xl max-w-md mx-auto backdrop-blur-sm bg-opacity-90 border border-gray-200">
            <div className="card-body p-4 sm:p-6">
              <h3 className="card-title text-lg flex items-center gap-2 mb-4">
                📋 Scan Results
                {isProcessingScan && (
                  <span className="text-xs text-gray-500">({scanProgress.completed}/{scanProgress.total})</span>
                )}
              </h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {attendanceResults.map((result, index) => (
                  <div key={index} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-gray-50 rounded gap-2">
                    <span className="font-medium text-sm sm:text-base">{result.name}</span>
                    <span className={`text-xs sm:text-sm ${result.status.includes('✅') ? 'text-green-600' : result.status.includes('❌') ? 'text-red-600' : 'text-yellow-600'}`}>
                      {result.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddUser && <AddUserModal />}
      
      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="flex justify-around items-center py-3">
          <button className="flex flex-col items-center text-gray-600">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mb-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-xs">Profile</span>
          </button>
          
          <button className="flex flex-col items-center text-gray-600">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mb-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-xs">Settings</span>
          </button>
          
          <button className="flex flex-col items-center text-gray-600">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mb-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 000 2h7.586l-1.293 1.293z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-xs">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
