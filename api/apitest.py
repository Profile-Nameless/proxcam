import requests
"""
# Replace these with your actual login credentials
email = "example@example.com"
password = "examplepassword"


session = requests.Session()

# Step 1: Load login page to initialize session
session.get("https://student.bennetterp.camu.in/login", headers={
    "User-Agent": "Mozilla/5.0"
})

# Step 2: Correct login payload as per your findings
login_payload = {
    "dtype": "M",
    "Email": email,
    "pwd": password
}

login_headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://student.bennetterp.camu.in",
    "Referer": "https://student.bennetterp.camu.in/login"
}

login_url = "https://student.bennetterp.camu.in/login/validate"

# Step 3: Send login request
response = session.post(login_url, json=login_payload, headers=login_headers)

# Step 4: Output response
print("Status code:", response.status_code)
print("Response text:", response.text)
print("Cookies:", session.cookies.get_dict())
"""

url = "https://student.bennetterp.camu.in/api/Attendance/record-online-attendance"

headers = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
    "appversion": "v2",
    "clienttzofst": "330",
    "cookie": "connect.sid=s%3AfxqdOtLUAxGWtTTn3hm973NyBZ3AbXQf.vO14QJttu442cjczWy35isRV2ehus4bwPZDCOUSShJM"
}

payload = {
    "attendanceId": "6891b2c5c9f44ea403d7d206_6891b3133ad5d54c2e27e050",
    "StuID": "668c1a4cb26adcc7e79ec73c",
    "offQrCdEnbld": True
}

response = requests.post(url, headers=headers, json=payload)

try:
    data = response.json()
    code = data.get("output", {}).get("data", {}).get("code")

    if code == "SUCCESS":
        print("✅ Attendance request accepted!")
    elif code == "ATTENDANCE_NOT_VALID":
        print("❌ Attendance not valid (expired QR or wrong student).")
    else:
        print("⚠️ Other status:", data)
except Exception as e:
    print("Error decoding response:", e)
    print("Raw response:", response.text)