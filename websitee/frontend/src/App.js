import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeScanType } from 'html5-qrcode';
import { BrowserMultiFormatReader } from '@zxing/browser';
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
  const [showQRScannedPopup, setShowQRScannedPopup] = useState(false);
  const [userCookies, setUserCookies] = useState([]);
  const [showAddUserButton, setShowAddUserButton] = useState(false);
  const dateTapCountRef = useRef(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [scanningHint, setScanningHint] = useState('');
  const [scanningMode, setScanningMode] = useState('auto');
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [scanAttempts, setScanAttempts] = useState(0);
  const [currentScanner, setCurrentScanner] = useState('html5'); // 'html5' or 'zxing'
  const [scannerSwitchAttempts, setScannerSwitchAttempts] = useState(0);

  // Load users from Supabase on mount
  useEffect(() => {
    console.log('🔄 Loading users from Supabase...');
    const loadUsersFromSupabase = async () => {
      try {
        const response = await fetch('/api/users-for-frontend');
        if (response.ok) {
          const supabaseUsers = await response.json();
          console.log('API returned users:', supabaseUsers);
          // Decrypt passwords for each user
          const decryptedUsers = supabaseUsers.map(user => ({
            ...user,
            password: decryptData(user.password) // Decrypt the password for CAMU authentication
          }));
          console.log('Loaded users from API (after decrypt):', decryptedUsers);
          setUsers(decryptedUsers);

          // Fetch a unique cookie for each user in parallel
          const cookies = await Promise.all(decryptedUsers.map(user => getFreshCookieForUser(user)));
          console.log('Fetched cookies:', cookies.length, cookies);
          setUserCookies(cookies);
        } else {
          console.error('❌ Failed to load users from Supabase');
        }
      } catch (error) {
        console.error('❌ Error loading users from Supabase:', error);
      }
    };
    
    loadUsersFromSupabase();
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
    setIsMinimized(false);
    setAttendanceResults([]);
    setScanningHint('Position QR code within the frame');
    setScanAttempts(0);
    setTimeout(() => {
      startScanner();
    }, 300);
  };

  const closeCamera = () => {
    console.log('📷 Closing camera...');
    setIsCameraOpen(false);
    stopScanner();
  };

  const startScanner = () => {
    if (!videoRef.current) {
      console.error('❌ Video ref not available');
      return;
    }
    
    console.log('🔍 Initializing QR scanner...');
    
    if (currentScanner === 'html5') {
      startHtml5Scanner();
    } else {
      startZxingScanner();
    }
  };

  const startHtml5Scanner = () => {
    console.log('📱 Starting HTML5 QR Scanner...');
    
    // Create new Html5Qrcode instance
    codeReader.current = new Html5Qrcode("qr-reader");
    
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      disableFlip: false,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };
    
    codeReader.current.start(
      { facingMode: "environment" },
      config,
      (decodedText, decodedResult) => {
        console.log('🎯 QR Code detected by HTML5!');
        console.log('📄 QR Data:', decodedText);
        setScanningHint('QR Code detected! Processing...');
        handleQRScan(decodedText);
        closeCamera();
      },
      (errorMessage) => {
        // Handle scan error
        console.log('🔍 HTML5 scanning... (no QR detected yet)');
        setScanAttempts(prev => prev + 1);
        setScannerSwitchAttempts(prev => prev + 1);
        
        // Auto-adjust settings based on scan attempts
        handleScanAttempts();
        
        // Switch to ZXing if HTML5 fails after many attempts
        if (scannerSwitchAttempts > 30 && currentScanner === 'html5') {
          console.log('🔄 Switching to ZXing scanner...');
          setCurrentScanner('zxing');
          setScannerSwitchAttempts(0);
          setScanAttempts(0);
          stopScanner();
          setTimeout(() => {
            startZxingScanner();
          }, 500);
        }
      }
    ).then(() => {
      console.log('✅ HTML5 Scanner started successfully');
    }).catch((err) => {
      console.error('❌ Failed to start HTML5 scanner:', err);
      // Fallback to ZXing
      setCurrentScanner('zxing');
      startZxingScanner();
    });
  };

  const startZxingScanner = () => {
    console.log('📱 Starting ZXing QR Scanner...');
    
    codeReader.current = new BrowserMultiFormatReader();
    
    codeReader.current.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
      if (result) {
        console.log('🎯 QR Code detected by ZXing!');
        console.log('📄 QR Data:', result.getText());
        setScanningHint('QR Code detected! Processing...');
        handleQRScan(result.getText());
        closeCamera();
      } else if (err) {
        console.log('🔍 ZXing scanning... (no QR detected yet)');
        setScanAttempts(prev => prev + 1);
        setScannerSwitchAttempts(prev => prev + 1);
        
        // Auto-adjust settings based on scan attempts
        handleScanAttempts();
        
        // Switch to HTML5 if ZXing fails after many attempts
        if (scannerSwitchAttempts > 30 && currentScanner === 'zxing') {
          console.log('🔄 Switching to HTML5 scanner...');
          setCurrentScanner('html5');
          setScannerSwitchAttempts(0);
          setScanAttempts(0);
          stopScanner();
          setTimeout(() => {
            startHtml5Scanner();
          }, 500);
        }
      }
    });
    
    console.log('✅ ZXing Scanner started successfully');
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
      setScanningHint(`Scanning with ${currentScanner.toUpperCase()}... Position QR code clearly`);
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
      if (currentScanner === 'html5') {
        codeReader.current.stop().then(() => {
          console.log('✅ HTML5 Scanner stopped');
          codeReader.current = null;
        }).catch((err) => {
          console.error('❌ Error stopping HTML5 scanner:', err);
        });
      } else {
        codeReader.current.reset();
        console.log('✅ ZXing Scanner stopped');
        codeReader.current = null;
      }
    }
  };

  const toggleFlash = () => {
    console.log('⚡ Toggling flash...');
    setIsFlashOn(!isFlashOn);
    // Note: Actual flash control would require camera API access
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

  const switchScanningMode = () => {
    const modes = ['auto', 'enhanced', 'high-sensitivity'];
    const currentIndex = modes.indexOf(scanningMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setScanningMode(nextMode);
    setScanAttempts(0);
    setScanningHint(`Switched to ${nextMode} mode`);
  };

  const handleQRScan = async (qrData) => {
    setShowQRScannedPopup(true);
    setTimeout(() => setShowQRScannedPopup(false), 2000);
    try {
      const attendanceId = qrData;
      // Use the pre-fetched cookies, one per user
      const cookies = userCookies;
      if (!cookies || cookies.length !== users.length) {
        alert('Cookies not loaded yet. Please wait and try again.');
        return;
      }
      // Assign each user their own cookie
      const results = await Promise.all(users.map((user, i) => {
        const userCookie = cookies[i];
        if (!userCookie) {
          return {
            name: user.name,
            status: '❌ Failed to get session cookie',
            code: 'COOKIE_ERROR'
          };
        }
        return fetch('/api/mark-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stuId: user.stuId,
            attendanceId: attendanceId,
            cookie: userCookie
          })
        })
        .then(response => response.json())
        .then(data => {
          const code = data?.output?.data?.code;
          let status = 'Unknown';
          if (code === 'SUCCESS') status = '✅ Marked Present';
          else if (code === 'ATTENDANCE_NOT_VALID') status = '❌ Invalid QR (expired or wrong student)';
          else status = `⚠️ ${code || 'Error'}`;
          return { name: user.name, status, code };
        })
        .catch(() => ({
          name: user.name,
          status: '❌ Error marking attendance',
          code: 'ERROR'
        }));
      }));
      setAttendanceResults(results);
    } catch (error) {
      console.error('💥 Error processing QR scan:', error);
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
              <div className={`bg-black rounded-lg shadow-2xl mb-6 transition-all duration-300 ${
                isMinimized ? 'w-64 h-48' : 'w-full'
              }`}>
                <div className="p-4 sm:p-6">
                  <div className="relative">
                    {/* QR Scanner Container for HTML5 */}
                    {currentScanner === 'html5' && (
                      <div 
                        id="qr-reader"
                        className={`rounded-lg transition-all duration-300 ${
                          isMinimized ? 'h-32' : 'h-80 sm:h-96 w-full'
                        }`}
                      />
                    )}
                    
                    {/* Video element for ZXing */}
                    {currentScanner === 'zxing' && (
                      <video 
                        ref={videoRef} 
                        className={`rounded-lg object-cover bg-black transition-all duration-300 ${
                          isMinimized ? 'h-32' : 'h-80 sm:h-96 w-full'
                        }`}
                        autoPlay={true} 
                        muted={true} 
                        playsInline={true}
                      />
                    )}

                    {/* QR Scanning Frame */}
                    {!isMinimized && (
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
                    )}

                    {/* Scanning Hint */}
                    {!isMinimized && scanningHint && (
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

                    {/* Mode Indicator */}
                    {!isMinimized && (
                      <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-xs">
                        Mode: {scanningMode}
                      </div>
                    )}
                    {/* Scanner Type Indicator */}
                    {!isMinimized && (
                      <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-xs">
                        Scanner: {currentScanner.toUpperCase()}
                      </div>
                    )}
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
                        onClick={openCamera}
                        className="bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 w-full text-sm font-medium"
                      >
                        Record Attendance
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
