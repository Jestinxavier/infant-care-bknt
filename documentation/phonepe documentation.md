# PhonePe Integration: Technical Documentation & Implementation Story

## 📖 The Story: Resolving the "Unauthorized" Mystery

### The Challenge
The integration of PhonePe into the Infant Care application began with a persistent and frustrating obstacle: a **401 Unauthorized** error. Despite following the documentation, every request to the PhonePe Sandbox API was rejected.

### The Investigation
We performed a deep audit of the authentication flow:
1.  **Checksum Precision**: We verified the `X-VERIFY` header generation logic, ensuring the SHA256 hashing of the base64 payload combined with the endpoint and Salt Key was mathematically perfect.
2.  **Payload Compliance**: We adjusted the `merchantTransactionId` to comply with PhonePe's strict 38-character limit.
3.  **The "Aha!" Moment**: Upon closer inspection of the credentials, we discovered the root cause. The "Salt Key" being used (`099eb0cd-02cf-4e2a-8aca-3e6c6aff0399`) was actually a **V2 Client Secret** (intended for SDKs), but we were using the **V1 Manual Flow** (Checksum-based).

### The Breakthrough
By switching to the correct official V1 Sandbox Salt Key (`96434309-7796-489d-8924-ab56988a6076`) associated with the Merchant ID `PGTESTPAYUAT86`, the authentication error vanished instantly. This confirmed that choosing the right flow (Path A: Manual V1) and matching it with correct credentials was the key to stability.

---

## 🛠️ Workflow & Affected Files

The integration follows a decoupled, modular architecture to ensure security and maintainability.

### 1. Configuration Layer
*   **File**: `src/config/phonepe.js`
*   **Role**: Centralizes the Merchant ID, Salt Key, and Index. It contains the `generateXVerify` utility, which is the heart of the security layer, and the `verifyCallbackChecksum` function for webhook validation.

### 2. Business Logic Layer
*   **File**: `src/controllers/payment/phonePeController.js`
*   **Role**:
    *   `initPhonePePayment`: Encodes the order data and initiates the request to PhonePe.
    *   `phonePeCallback`: Validates incoming webhooks from PhonePe and updates the database.
    *   `checkPaymentStatus`: Allows manual polling of payment status.
    *   `initiatePhonePeRefund`: Handles post-purchase refund requests.

### 3. API Routing & Documentation
*   **File**: `src/routes/paymentRoutes.js`
*   **Role**: Defines the RESTful endpoints and provides comprehensive **Swagger (OpenAPI)** documentation for both developers and the frontend team.

### 4. Database Stability
*   **File**: `src/server.js`
*   **Role**: Implements a MongoDB connection retry mechanism. This was critical during debugging to prevent server crashes when the database connection fluctuated (ECNRESET errors).

### 5. Environment Variables
*   **File**: `.env`
*   **Role**: Stores sensitive credentials.

---

## 🚀 Production Environment Migration

When moving from Sandbox (Testing) to Production (Live), you **MUST** change the following settings in your `.env` file and PhonePe Dashboard.

### 1. Environment Variable Changes (`.env`)

| Variable | Sandbox Value (Current) | Production Value (Action) |
| :--- | :--- | :--- |
| `PHONEPE_MERCHANT_ID` | `PTPAAT86` | Replace with your **Live Merchant ID**. |
| `PHONEPE_SALT_KEY` | `94309-7796-4-8924-ab56988a6` | Replace with your **Live Salt Key**. |
| `PHONEPE_SALT_INDEX` | `1` | Replace with your **Live Salt Index** (usually 1). |
| `PHONEPE_REDIRECT_URL` | `http://127.0.0.1:3000/...` | Update to your live frontend URL (e.g., `https://inae.com/orders`). |
| `PHONEPE_CALLBACK_URL` | `https://ngrok-url/...` | Update to your live backend API URL (e.g., `https://api.in.com/api/v1/payments/phonepe/callback`). |
| `BACKEND_URL` | `http://localhost:5001` | Update to your live backend domain. |

### 2. PhonePe Dashboard Configuration

> [!IMPORTANT]
> **HTTPS is Required**: PhonePe's production environment will only send callbacks to URLs starting with `https://`. Use a valid SSL certificate.

- **Redirect URL**: Set this in the PhonePe Dashboard to the page where customers should land after payment (e.g., "Thank You" page or Order History).
- **Callback URL (Webhook)**: This is the most critical setting. It must be reachable from the internet. Ensure your firewall allows incoming POST requests from PhonePe's IP range.
- **Whitelist**: Ensure your production server IP is whitelisted in the PhonePe Merchant portal if required.

---

## 🔒 Security Best Practices
1.  **Never** commit your live `.env` file to Github.
2.  Use the `verifyCallbackChecksum` utility to ensure every webhook received is actually from PhonePe and hasn't been tampered with.
3.  Rotate your Salt Keys every 6–12 months for maximum security.
