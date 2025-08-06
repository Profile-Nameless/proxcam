const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Hash password function for secure storage
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

// Base64 encode function (Node.js equivalent of btoa)
const btoa = (str) => {
  return Buffer.from(str, 'utf8').toString('base64');
};

// Helper: MyCamu login
async function myCamuLogin(email, password) {
  const loginUrl = 'https://student.bennetterp.camu.in/login/validate';
  const payload = {
    dtype: 'M',
    Email: email,
    pwd: password,
  };
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0',
    'Origin': 'https://student.bennetterp.camu.in',
    'Referer': 'https://student.bennetterp.camu.in/login',
  };
  const response = await axios.post(loginUrl, payload, { headers, withCredentials: true });
  return response;
}

// POST /login: Get name and StuID
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const response = await myCamuLogin(email, password);
    const data = response.data;
    const logindetails = data?.output?.data?.logindetails;
    if (!logindetails) return res.status(400).json({ error: 'Invalid login response' });
    const name = logindetails.Name;
    const stuId = logindetails.Student?.[0]?.StuID;
    if (!name || !stuId) return res.status(400).json({ error: 'Could not extract name or StuID' });
    
    // Store user data in Supabase
    try {
      const { data: supabaseData, error: supabaseError } = await supabase
        .from('attendance_records')
        .insert([
          {
            email: email,
            name: name,
            stu_id: stuId,
            password_hash: hashPassword(password),
            password_encrypted: btoa(encodeURIComponent(password)) // Store encrypted version
          }
        ])
        .select();

      if (supabaseError) {
        console.error('Supabase error:', supabaseError);
        // Don't fail the login if Supabase fails, just log it
      } else {
        console.log('User data stored in Supabase:', supabaseData);
        console.log('🔐 Password encryption test:');
        console.log('  Original password:', password);
        console.log('  Encrypted password:', btoa(encodeURIComponent(password)));
        console.log('  Decryption test:', decodeURIComponent(atob(btoa(encodeURIComponent(password)))));
      }
    } catch (supabaseErr) {
      console.error('Error storing in Supabase:', supabaseErr);
    }

    res.json({ name, stuId });
  } catch (err) {
    res.status(401).json({ error: 'Login failed', details: err.message });
  }
});

// POST /get-cookie: Get session cookie
app.post('/get-cookie', async (req, res) => {
  const { email, password } = req.body;
  console.log('🍪 Cookie request received:');
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
  
  try {
    const response = await myCamuLogin(email, password);
    const setCookie = response.headers['set-cookie'];
    if (!setCookie) return res.status(400).json({ error: 'No session cookie received' });
    // Find connect.sid cookie
    const connectSid = setCookie.find(c => c.startsWith('connect.sid='));
    if (!connectSid) return res.status(400).json({ error: 'No connect.sid cookie found' });
    res.json({ cookie: connectSid.split(';')[0] });
  } catch (err) {
    res.status(401).json({ error: 'Login failed', details: err.message });
  }
});

// GET /users: Get all users from Supabase (for admin use)
app.get('/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

// GET /users-for-frontend: Get users with encrypted passwords for frontend use
app.get('/users-for-frontend', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('email, name, stu_id, password_encrypted, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Convert to frontend format
    const frontendUsers = data.map(user => {
      console.log(`🔐 Backend sending user: ${user.name}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Encrypted password: ${user.password_encrypted}`);
      console.log(`  Student ID: ${user.stu_id}`);
      
      return {
        id: Date.now() + Math.random(), // Generate unique ID
        email: user.email, // This is the actual email
        password: user.password_encrypted, // This is the encrypted password
        name: user.name,
        stuId: user.stu_id
      };
    });

    console.log(`📤 Sending ${frontendUsers.length} users to frontend`);
    res.json(frontendUsers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

// POST /mark-attendance: Mark attendance for a user
app.post('/mark-attendance', async (req, res) => {
  const { stuId, attendanceId, cookie } = req.body;
  try {
    const url = 'https://student.bennetterp.camu.in/api/Attendance/record-online-attendance';
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'appversion': 'v2',
      'clienttzofst': '330',
      'cookie': cookie,
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'https://student.bennetterp.camu.in',
      'Referer': 'https://student.bennetterp.camu.in/attendance',
    };
    const payload = {
      attendanceId,
      StuID: stuId,
      offQrCdEnbld: true,
    };
    const response = await axios.post(url, payload, { headers });
    res.json(response.data);
  } catch (err) {
    res.status(400).json({ error: 'Attendance marking failed', details: err.message });
  }
});

const PORT = process.env.PORT || 3001;

// Add error handling for server startup
const server = app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
  console.log(`Environment variables loaded:`, {
    SUPABASE_URL: process.env.SUPABASE_URL ? 'Set' : 'Missing',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Missing'
  });
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('💡 Port 3001 is already in use. Try a different port.');
  }
});