import React, { useState, useEffect, useRef } from 'react';
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

  // Load users from Supabase on mount
  useEffect(() => {
    console.log('🔄 Loading users from Supabase...');
    const loadUsersFromSupabase = async () => {
      try {
        const response = await fetch('/api/users-for-frontend');
        if (response.ok) {
          const supabaseUsers = await response.json();
          // Decrypt passwords for each user
          const decryptedUsers = supabaseUsers.map(user => ({
            ...user,
            password: decryptData(user.password) // Decrypt the password for CAMU authentication
          }));
          setUsers(decryptedUsers);
        } else {
          console.error('❌ Failed to load users from Supabase');
        }
      } catch (error) {
        console.error('❌ Error loading users from Supabase:', error);
      }
    };
    
    loadUsersFromSupabase();
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

  const openCamera = () => {
    console.log('📷 Opening camera...');
    setIsCameraOpen(true);
    setAttendanceResults([]);
    setTimeout(() => {
      console.log('🎬 Starting scanner...');
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
    codeReader.current = new BrowserMultiFormatReader();
    
    console.log('🎥 Starting video stream...');
    codeReader.current.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
      if (result) {
        console.log('🎯 QR Code detected!');
        console.log('📄 QR Data:', result.getText());
        handleQRScan(result.getText());
        closeCamera();
      } else if (err) {
        console.log('🔍 Scanning... (no QR detected yet)');
      }
    });
    
    console.log('✅ Scanner started successfully');
  };

  const stopScanner = () => {
    console.log('⏹️ Stopping scanner...');
    if (codeReader.current) {
      codeReader.current.reset();
      codeReader.current = null;
      console.log('✅ Scanner stopped');
    }
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

  const toggleFlash = () => {
    console.log('⚡ Toggling flash...');
    setIsFlashOn(!isFlashOn);
    // Note: Actual flash control would require camera API access
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

  const handleQRScan = async (qrData) => {
    try {
      const attendanceId = qrData;
      const results = [];
      
      for (let i = 0; i < users.length; i++) {
        // Only log the cookie message, no user info
        console.log('🍪 Getting fresh cookie');
        
        // Get fresh cookie for this user
        const user = users[i];
        const userCookie = await getFreshCookieForUser(user);
        
        if (!userCookie) {
          results.push({
            name: user.name,
            status: '❌ Failed to get session cookie',
            code: 'COOKIE_ERROR'
          });
          continue;
        }
        
        try {
          const response = await fetch('/api/mark-attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stuId: user.stuId,
              attendanceId: attendanceId,
              cookie: userCookie
            })
          });
          
          const data = await response.json();
          const code = data?.output?.data?.code;
          
          let status = 'Unknown';
          if (code === 'SUCCESS') {
            status = '✅ Marked Present';
          } else if (code === 'ATTENDANCE_NOT_VALID') {
            status = '❌ Invalid QR (expired or wrong student)';
          } else {
            status = `⚠️ ${code || 'Error'}`;
          }
          
          results.push({
            name: user.name,
            status: status,
            code: code
          });
        } catch (error) {
          results.push({
            name: user.name,
            status: '❌ Error marking attendance',
            code: 'ERROR'
          });
        }
      }
      
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
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Add User Button */}
        <div className="mb-4">
          <button
            onClick={() => setShowAddUser(true)}
            className="bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 w-full text-base font-medium"
          >
            Add User
          </button>
        </div>

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
              <span className="text-base font-medium">05-Aug-2025</span>
              <button className="text-gray-600 hover:text-gray-800 p-2">
                <span className="text-xl">›</span>
              </button>
            </div>

            {/* QR Scanner - Above Today's Schedule */}
            {isCameraOpen && (
              <div className="bg-black rounded-lg shadow-2xl mb-6">
                <div className="p-4 sm:p-6">
                  <div className="relative">
                    <video 
                      ref={videoRef} 
                      className="w-full h-80 sm:h-96 rounded-lg object-cover bg-black" 
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

                    {/* Camera Controls */}
                    <div className="absolute top-4 right-4 flex flex-col gap-3">
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
                    <div className="absolute bottom-4 right-4">
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
