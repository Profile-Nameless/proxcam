const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

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
    res.json({ name, stuId });
  } catch (err) {
    res.status(401).json({ error: 'Login failed', details: err.message });
  }
});

// POST /get-cookie: Get session cookie
app.post('/get-cookie', async (req, res) => {
  const { email, password } = req.body;
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
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
}); 