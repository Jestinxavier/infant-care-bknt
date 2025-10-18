# 🔑 PhonePe Credentials - Complete Guide

Step-by-step guide to get your PhonePe Merchant ID and Salt Key.

---

## 📋 Quick Summary

| What You Need | Where to Get It |
|---------------|-----------------|
| **Merchant ID** | PhonePe Business Dashboard |
| **Salt Key** | PhonePe Developer Settings |
| **Salt Index** | Usually "1" (provided with Salt Key) |

---

## 🚀 Step-by-Step Process

### Step 1: Sign Up for PhonePe Business

**URL:** https://business.phonepe.com/

1. Click **"Get Started"** or **"Sign Up"**
2. Choose account type:
   - **Merchant** (for accepting payments)
   - NOT "PhonePe for Developers" (that's different)

### Step 2: Basic Registration

**Provide:**
- ✅ Business email
- ✅ Mobile number
- ✅ Create password
- ✅ Verify OTP

### Step 3: Business Information

**Fill in details:**
- Business name
- Business type (Pvt Ltd, Proprietorship, etc.)
- Industry/Category
- Website URL (if any)

### Step 4: Documents Upload (KYC)

**Required documents:**

#### For Proprietorship:
- PAN Card (Business owner)
- Aadhaar Card
- Bank account proof
- Business registration certificate (if applicable)

#### For Private Limited/LLP:
- Company PAN
- GST Certificate
- Certificate of Incorporation
- MOA/AOA
- Board resolution
- Director KYC (PAN, Aadhaar)
- Bank account proof

#### Bank Details:
- Bank account number
- IFSC code
- Cancelled cheque or bank statement

### Step 5: Wait for Approval

- **Timeline:** 1-3 business days
- **Status:** Check email for updates
- **Note:** You get sandbox access immediately, production after approval

---

## 🔧 Accessing Your Credentials

### For Testing (Sandbox) - Available Immediately

**After signup, you can access sandbox credentials:**

1. **Login to Dashboard:**
   ```
   https://business.phonepe.com/login
   ```

2. **Navigate to Developer Section:**
   ```
   Dashboard → Developer → API Credentials
   OR
   Settings → API Keys
   ```

3. **Switch to Sandbox/Test Mode:**
   Look for environment toggle (Sandbox/Production)

4. **Copy Credentials:**

   **Example Sandbox Credentials:**
   ```
   Merchant ID: PGTESTPAYUAT
   Salt Key: 099eb0cd-02cf-4e2a-8aca-3e6c6aff0399
   Salt Index: 1
   Environment: UAT/Sandbox
   ```

### For Production - After KYC Approval

**Once approved:**

1. **Login to Dashboard**
2. **Switch to Production Mode**
3. **Navigate to API Credentials**
4. **Copy Production Credentials**

   **Production credentials will look like:**
   ```
   Merchant ID: M123456789012345
   Salt Key: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   Salt Index: 1
   Environment: Production
   ```

---

## 📱 Dashboard Navigation

### Visual Guide:

```
┌─────────────────────────────────────────────┐
│  PhonePe Business Dashboard                 │
├─────────────────────────────────────────────┤
│                                             │
│  📊 Dashboard                               │
│  💰 Transactions                            │
│  📈 Reports                                 │
│  👥 Customers                               │
│                                             │
│  ⚙️  Settings  ← Click Here                 │
│     ├─ Business Profile                    │
│     ├─ 🔑 API Keys  ← Your Credentials     │
│     ├─ Webhooks                            │
│     ├─ Security                            │
│     └─ Team                                │
│                                             │
│  🔧 Developer  ← Alternative Location       │
│     ├─ 📜 API Documentation                │
│     ├─ 🔑 Credentials  ← Your Keys Here    │
│     ├─ 🧪 Test Environment                 │
│     ├─ 📊 Integration Status               │
│     └─ 🛠️  Tools                           │
│                                             │
│  ℹ️  Help & Support                         │
│                                             │
└─────────────────────────────────────────────┘
```

### In API Keys Section:

```
┌────────────────────────────────────────────────┐
│  API Credentials                               │
├────────────────────────────────────────────────┤
│                                                │
│  Environment: [Sandbox ▼] [Production]        │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │  Merchant ID                             │ │
│  │  ┌────────────────────────────────────┐ │ │
│  │  │ PGTESTPAYUAT                       │ │ │
│  │  └────────────────────────────────────┘ │ │
│  │  [Copy]                                  │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │  Salt Key                                │ │
│  │  ┌────────────────────────────────────┐ │ │
│  │  │ 099eb0cd-02cf-4e2a-8aca-3e6...    │ │ │
│  │  └────────────────────────────────────┘ │ │
│  │  [Show] [Copy]                           │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │  Salt Index: 1                           │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  [Generate New Key] [View Documentation]      │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 🎯 What Each Credential Is

### Merchant ID
- **What:** Unique identifier for your business
- **Format:** Alphanumeric (e.g., PGTESTPAYUAT or M123456789012345)
- **Used for:** Identifying your merchant account in API calls
- **Public:** Can be visible in frontend (but keep secure)

### Salt Key
- **What:** Secret key for generating checksums
- **Format:** UUID-like string (e.g., 099eb0cd-02cf-4e2a-8aca-3e6c6aff0399)
- **Used for:** Creating SHA256 checksums for security
- **Secret:** NEVER expose in frontend or public code
- **Storage:** Backend .env file only

### Salt Index
- **What:** Version number of your salt key
- **Format:** Number (usually "1")
- **Used for:** Checksum generation
- **Default:** Almost always "1"

---

## ⚙️ Configuration in Your Project

### Backend (.env file):

```env
# Sandbox/Testing (Use immediately)
PHONEPE_MERCHANT_ID=PGTESTPAYUAT
PHONEPE_SALT_KEY=099eb0cd-02cf-4e2a-8aca-3e6c6aff0399
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=development

# API Endpoints
PHONEPE_REDIRECT_URL=http://localhost:3001/payment/callback
PHONEPE_CALLBACK_URL=http://localhost:3000/api/v1/payments/phonepe/callback
```

### Production (.env file):

```env
# Production (After KYC approval)
PHONEPE_MERCHANT_ID=M123456789012345
PHONEPE_SALT_KEY=your-production-salt-key-here
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=production

# Production URLs
PHONEPE_REDIRECT_URL=https://yourapp.com/payment/callback
PHONEPE_CALLBACK_URL=https://api.yourapp.com/api/v1/payments/phonepe/callback
```

---

## 🧪 Testing Without Account (Sandbox)

If you just want to test the integration flow:

### PhonePe Provides Public Test Credentials:

```env
# Public sandbox credentials (for initial testing)
PHONEPE_MERCHANT_ID=PGTESTPAYUAT
PHONEPE_SALT_KEY=099eb0cd-02cf-4e2a-8aca-3e6c6aff0399
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=development
```

**Note:** These are for testing the flow only. For real testing and production, you need your own account.

---

## ⚠️ Common Issues

### Issue 1: Can't Find API Keys Section

**Solution:**
- Make sure you're logged into business.phonepe.com (NOT developer.phonepe.com)
- Look under Settings → API Keys OR Developer → Credentials
- If not visible, complete business profile first

### Issue 2: Only See Sandbox, Not Production

**Solution:**
- Production credentials only appear after KYC approval
- Check email for approval status
- Contact PhonePe support if pending > 5 days

### Issue 3: Invalid Merchant ID Error

**Solution:**
- Double-check you copied correctly (no extra spaces)
- Ensure using correct environment (sandbox vs production)
- Verify environment variable is loaded (check with console.log)

### Issue 4: Checksum Mismatch

**Solution:**
- Verify Salt Key is correct
- Check Salt Index (usually "1")
- Ensure no extra characters when copying

---

## 📞 PhonePe Support

### For Questions:

**Business Dashboard:**
- Help → Support
- Live chat available

**Email:**
- business@phonepe.com

**Phone:**
- Check dashboard for support number

**Documentation:**
- https://developer.phonepe.com/

**Integration Help:**
- Dashboard → Developer → Documentation

---

## ✅ Verification Checklist

Before going live:

- [ ] Business account created
- [ ] Email verified
- [ ] Mobile verified
- [ ] Business details submitted
- [ ] KYC documents uploaded
- [ ] Bank account verified
- [ ] Sandbox credentials obtained
- [ ] Integration tested in sandbox
- [ ] KYC approved (for production)
- [ ] Production credentials obtained
- [ ] Production tested
- [ ] Callback URL verified (public/accessible)

---

## 🎯 Quick Start Timeline

| Day | Action | Status |
|-----|--------|--------|
| Day 1 | Sign up, get sandbox access | ✅ Immediate |
| Day 1-2 | Submit KYC documents | ✅ You do this |
| Day 2-5 | PhonePe reviews KYC | ⏳ Wait |
| Day 5 | Approval email | ✅ Check email |
| Day 5+ | Production access | ✅ Go live! |

---

## 💡 Pro Tips

1. **Start with Sandbox:**
   - Test complete integration
   - Don't wait for production approval
   - Use test credentials provided

2. **Keep Credentials Safe:**
   - Use .env files
   - Add .env to .gitignore
   - Never commit credentials to git
   - Different credentials for dev/prod

3. **Test Thoroughly:**
   - Test payment success
   - Test payment failure
   - Test timeout scenarios
   - Test callback handling

4. **Monitor Dashboard:**
   - Check for approval updates
   - Monitor test transactions
   - Review integration status

5. **Documentation:**
   - Bookmark PhonePe docs
   - Save support contacts
   - Keep credentials in password manager

---

## 🚀 Ready to Go!

Once you have your credentials:

1. ✅ Add to backend `.env` file
2. ✅ Update frontend URLs
3. ✅ Test in sandbox
4. ✅ Verify callbacks work
5. ✅ Ready for production!

---

**For integration code, see:**
- [Next.js Integration Guide](./NEXTJS_PHONEPE_INTEGRATION.md)
- [Backend API Documentation](./PHONEPE_INTEGRATION.md)

**Need help?** Check [PhonePe Testing Guide](./PHONEPE_TESTING_GUIDE.md)
