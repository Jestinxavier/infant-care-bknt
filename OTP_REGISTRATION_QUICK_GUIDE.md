# 🚀 OTP Registration - Quick Guide

## 📋 Two-Step Registration Flow

### **Step 1: Request OTP (Email Only)**
```bash
POST /api/v1/auth/request-otp
Content-Type: application/json

{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to your email. Please verify to complete registration.",
  "email": "john@example.com",
  "expiresIn": "10 minutes"
}
```

**What happens:**
- ✅ Checks if email already registered
- ✅ Generates 6-digit OTP (e.g., 123456)
- ✅ Sends OTP to email
- ✅ OTP valid for 10 minutes
- ✅ Max 5 verification attempts

**User receives email:**
```
Subject: 🔐 Your Verification Code

Your OTP: 1 2 3 4 5 6

Expires in 10 minutes.
```

---

### **Step 2: Verify OTP & Register (All Data + Tokens)**
```bash
POST /api/v1/auth/verify-otp
Content-Type: application/json

{
  "email": "john@example.com",
  "username": "johndoe",
  "password": "password123",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful! Welcome to Online Shopping.",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64abc123def456789",
    "username": "johndoe",
    "email": "john@example.com",
    "role": "user",
    "isEmailVerified": true
  }
}
```

**What happens:**
- ✅ Validates OTP
- ✅ Checks username availability
- ✅ Creates user account (password hashed)
- ✅ Generates access & refresh tokens
- ✅ Sends welcome email
- ✅ User can immediately use the app!

---

## 🔄 Complete Registration Example

### Frontend Implementation

```jsx
import { useState } from 'react';

function RegisterFlow() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    otp: ''
  });
  const [tokens, setTokens] = useState(null);

  // Step 1: Request OTP
  const requestOTP = async (e) => {
    e.preventDefault();

    const response = await fetch('/api/v1/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (data.success) {
      alert('✅ OTP sent to ' + email);
      setStep(2); // Move to verification step
    } else {
      alert('❌ ' + data.msg);
    }
  };

  // Step 2: Verify OTP & Register
  const verifyAndRegister = async (e) => {
    e.preventDefault();

    const response = await fetch('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        username: formData.username,
        password: formData.password,
        otp: formData.otp
      })
    });

    const data = await response.json();

    if (data.success) {
      // Save tokens
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      
      alert('✅ Registration successful!');
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } else {
      alert('❌ ' + data.msg);
    }
  };

  return (
    <div>
      {step === 1 ? (
        // Step 1: Email Input
        <form onSubmit={requestOTP}>
          <h2>Get Started</h2>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit">Send OTP</button>
        </form>
      ) : (
        // Step 2: Complete Registration
        <form onSubmit={verifyAndRegister}>
          <h2>Complete Registration</h2>
          <p>OTP sent to: {email}</p>
          
          <input
            type="text"
            placeholder="Username"
            value={formData.username}
            onChange={(e) => setFormData({...formData, username: e.target.value})}
            required
          />
          
          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
            required
            minLength={6}
          />
          
          <input
            type="text"
            placeholder="Enter 6-digit OTP"
            value={formData.otp}
            onChange={(e) => setFormData({...formData, otp: e.target.value.replace(/\D/g, '').slice(0, 6)})}
            required
            maxLength={6}
            style={{ fontSize: '24px', letterSpacing: '8px', textAlign: 'center' }}
          />
          
          <button type="submit">Create Account</button>
        </form>
      )}
    </div>
  );
}
```

---

## 🧪 Testing with Postman/cURL

### Test Step 1: Request OTP
```bash
curl -X POST http://localhost:3000/api/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Check your email for OTP
```

### Test Step 2: Verify & Register
```bash
curl -X POST http://localhost:3000/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "username":"testuser",
    "password":"password123",
    "otp":"123456"
  }'

# Returns access & refresh tokens ✅
```

### Test Resend OTP
```bash
curl -X POST http://localhost:3000/api/v1/auth/resend-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

---

## ⚡ Key Features

| Feature | Details |
|---------|---------|
| **Step 1** | Email only → OTP sent |
| **Step 2** | Email + Username + Password + OTP → Account + Tokens |
| **OTP Expiry** | 10 minutes |
| **Max Attempts** | 5 failed attempts |
| **Immediate Login** | Tokens returned on registration |
| **No Duplicate Accounts** | Email & username checked |

---

## 🔐 Security Features

✅ **Email Verification** - OTP confirms email ownership  
✅ **Short-lived OTP** - 10-minute expiry  
✅ **Attempt Limiting** - Max 5 tries  
✅ **Password Hashing** - Bcrypt on user creation  
✅ **Token-Based Auth** - JWT access & refresh tokens  
✅ **No Sensitive Data Storage** - OTP storage only, no passwords until verified  

---

## ❌ Error Handling

### Email Already Registered
```json
{
  "success": false,
  "msg": "Email is already registered"
}
```

### Username Taken
```json
{
  "success": false,
  "msg": "Username is already taken"
}
```

### Invalid OTP
```json
{
  "success": false,
  "msg": "Invalid OTP. 4 attempts remaining."
}
```

### OTP Expired
```json
{
  "success": false,
  "msg": "OTP has expired. Please request a new one."
}
```

### Too Many Attempts
```json
{
  "success": false,
  "msg": "Too many failed attempts. Please request a new OTP."
}
```

---

## 📊 Flow Diagram

```
┌─────────────────────────────────┐
│   User enters email             │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  POST /request-otp              │
│  { "email": "..." }             │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Email sent with 6-digit OTP    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  User enters:                   │
│  • Username                     │
│  • Password                     │
│  • OTP from email               │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  POST /verify-otp               │
│  { email, username,             │
│    password, otp }              │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  ✅ Account Created             │
│  ✅ Tokens Returned             │
│  ✅ Welcome Email Sent          │
│  ✅ Ready to Use App            │
└─────────────────────────────────┘
```

---

## 🎯 Why This Flow?

✅ **Simpler Step 1** - Just email, quick OTP request  
✅ **All Data in Step 2** - One-time complete form  
✅ **Immediate Access** - Tokens returned, no need to login  
✅ **Better UX** - Less back-and-forth  
✅ **Email Verified** - OTP confirms ownership  
✅ **Secure** - No username/password until email confirmed  

---

## 📚 API Endpoints Summary

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| `POST` | `/api/v1/auth/request-otp` | `{ email }` | OTP sent message |
| `POST` | `/api/v1/auth/verify-otp` | `{ email, username, password, otp }` | **Tokens + User** |
| `POST` | `/api/v1/auth/resend-otp` | `{ email }` | New OTP sent |
| `POST` | `/api/v1/auth/login` | `{ email, password }` | Tokens (for future logins) |

---

## ✨ Next Steps After Registration

After successful verification, you have:
- ✅ `accessToken` - Use for API requests
- ✅ `refreshToken` - Use to get new access token
- ✅ User is logged in automatically

**Use tokens immediately:**
```javascript
// Store tokens
localStorage.setItem('accessToken', data.accessToken);
localStorage.setItem('refreshToken', data.refreshToken);

// Make authenticated requests
fetch('/api/v1/protected-route', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  }
});
```

---

**Documentation:** [`OTP_REGISTRATION_GUIDE.md`](OTP_REGISTRATION_GUIDE.md)  
**Swagger Docs:** http://localhost:3000/api-docs  
**Status:** ✅ Production Ready
