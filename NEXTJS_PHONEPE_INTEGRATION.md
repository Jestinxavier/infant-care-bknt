# 🎨 Next.js + PhonePe Integration Guide

Complete guide to integrate your backend PhonePe payment system with Next.js frontend.

---

## 📋 Table of Contents

1. [Environment Setup](#-environment-setup)
2. [Payment Flow](#-payment-flow)
3. [API Service](#-api-service)
4. [Checkout Component](#-checkout-component)
5. [Payment Callback Page](#-payment-callback-page)
6. [Order Status Component](#-order-status-component)
7. [Complete Example](#-complete-example)

---

## 🔧 Environment Setup

### 1. Create `.env.local` in Next.js Project

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1

# Frontend URLs (for PhonePe redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

### 2. Backend `.env` Configuration

```env
# PhonePe Configuration
PHONEPE_MERCHANT_ID=your_merchant_id_here
PHONEPE_SALT_KEY=your_salt_key_here
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=development

# Important: Frontend callback URL
PHONEPE_REDIRECT_URL=http://localhost:3001/payment/callback
PHONEPE_CALLBACK_URL=http://localhost:3000/api/v1/payments/phonepe/callback
```

---

## 🔄 Payment Flow

```
┌──────────────┐
│   Next.js    │
│   Frontend   │
└──────┬───────┘
       │
       │ 1. User clicks "Pay Now"
       ▼
┌──────────────────────────────┐
│ Create Order                 │
│ POST /api/v1/orders/create   │
└──────┬───────────────────────┘
       │
       │ 2. Order created (paymentMethod: PhonePe)
       │ Returns: { order, requiresPayment: true }
       ▼
┌──────────────────────────────┐
│ Initialize PhonePe Payment   │
│ POST /api/v1/payments/       │
│      phonepe/init            │
└──────┬───────────────────────┘
       │
       │ 3. Returns: { paymentUrl, transactionId }
       ▼
┌──────────────┐
│ Redirect to  │
│ PhonePe Page │
└──────┬───────┘
       │
       │ 4. User completes payment
       ▼
┌──────────────────────────────┐
│ PhonePe sends callback to    │
│ Backend (automatic)          │
│ POST /api/v1/payments/       │
│      phonepe/callback        │
└──────┬───────────────────────┘
       │
       │ 5. Backend updates order status
       │    PhonePe redirects user
       ▼
┌──────────────────────────────┐
│ Next.js Callback Page        │
│ /payment/callback?orderId=XX │
└──────┬───────────────────────┘
       │
       │ 6. Check order status
       │ GET /api/v1/orders/:orderId
       ▼
┌──────────────┐
│ Show Success │
│ or Failure   │
└──────────────┘
```

---

## 🛠️ API Service

Create `lib/api.js` in your Next.js project:

```javascript
// lib/api.js
const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Create Order
export async function createOrder(orderData) {
  const response = await fetch(`${API_URL}/orders/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create order');
  }

  return response.json();
}

// Initialize PhonePe Payment
export async function initPhonePePayment(paymentData) {
  const response = await fetch(`${API_URL}/payments/phonepe/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(paymentData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to initialize payment');
  }

  return response.json();
}

// Check Payment Status
export async function checkPaymentStatus(transactionId) {
  const response = await fetch(
    `${API_URL}/payments/phonepe/status/${transactionId}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to check payment status');
  }

  return response.json();
}

// Get Order Details
export async function getOrder(orderId) {
  const response = await fetch(`${API_URL}/orders/${orderId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch order');
  }

  return response.json();
}
```

---

## 🛒 Checkout Component

Create `components/Checkout.jsx`:

```javascript
// components/Checkout.jsx
'use client';

import { useState } from 'react';
import { createOrder, initPhonePePayment } from '@/lib/api';

export default function Checkout({ cart, userId, addressId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePhonePePayment = async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Create Order
      const orderData = {
        userId: userId,
        items: cart.map(item => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        addressId: addressId,
        paymentMethod: 'PhonePe',
      };

      const orderResult = await createOrder(orderData);

      // Check if payment is required
      if (!orderResult.requiresPayment) {
        // COD order - no payment needed
        window.location.href = `/order/success?orderId=${orderResult.order._id}`;
        return;
      }

      // Step 2: Initialize PhonePe Payment
      const paymentData = {
        orderId: orderResult.order._id,
        amount: orderResult.order.totalAmount,
        userId: userId,
        userPhone: '9876543210', // Get from user profile
        userName: 'User Name', // Get from user profile
      };

      const paymentResult = await initPhonePePayment(paymentData);

      // Step 3: Redirect to PhonePe
      if (paymentResult.success && paymentResult.data.paymentUrl) {
        // Save transaction ID to localStorage for later verification
        localStorage.setItem('currentTransaction', paymentResult.data.transactionId);
        localStorage.setItem('currentOrder', orderResult.order._id);
        
        // Redirect to PhonePe payment page
        window.location.href = paymentResult.data.paymentUrl;
      } else {
        throw new Error('Failed to get payment URL');
      }

    } catch (err) {
      console.error('Payment error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleCOD = async () => {
    try {
      setLoading(true);
      setError(null);

      const orderData = {
        userId: userId,
        items: cart.map(item => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        addressId: addressId,
        paymentMethod: 'COD',
      };

      const result = await createOrder(orderData);
      
      // Redirect to success page
      window.location.href = `/order/success?orderId=${result.order._id}`;

    } catch (err) {
      console.error('Order error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="checkout-container">
      <h2>Choose Payment Method</h2>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="payment-methods">
        {/* PhonePe Payment Button */}
        <button
          onClick={handlePhonePePayment}
          disabled={loading}
          className="payment-btn phonepe"
        >
          {loading ? 'Processing...' : 'Pay with PhonePe'}
        </button>

        {/* COD Button */}
        <button
          onClick={handleCOD}
          disabled={loading}
          className="payment-btn cod"
        >
          {loading ? 'Processing...' : 'Cash on Delivery'}
        </button>
      </div>

      <style jsx>{`
        .checkout-container {
          max-width: 500px;
          margin: 2rem auto;
          padding: 2rem;
        }

        .payment-methods {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .payment-btn {
          padding: 1rem 2rem;
          font-size: 1rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .payment-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .payment-btn.phonepe {
          background: #5f259f;
          color: white;
        }

        .payment-btn.phonepe:hover:not(:disabled) {
          background: #4a1d7a;
        }

        .payment-btn.cod {
          background: #4caf50;
          color: white;
        }

        .payment-btn.cod:hover:not(:disabled) {
          background: #45a049;
        }

        .error-message {
          padding: 1rem;
          background: #fee;
          color: #c33;
          border-radius: 4px;
          margin-bottom: 1rem;
        }
      `}</style>
    </div>
  );
}
```

---

## 📄 Payment Callback Page

Create `app/payment/callback/page.jsx`:

```javascript
// app/payment/callback/page.jsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { checkPaymentStatus, getOrder } from '@/lib/api';

export default function PaymentCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Verifying your payment...');
  const [orderDetails, setOrderDetails] = useState(null);

  useEffect(() => {
    verifyPayment();
  }, []);

  const verifyPayment = async () => {
    try {
      // Get order ID from URL or localStorage
      const orderId = searchParams.get('orderId') || localStorage.getItem('currentOrder');
      const transactionId = localStorage.getItem('currentTransaction');

      if (!orderId) {
        throw new Error('Order ID not found');
      }

      // Wait a bit for backend callback to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check payment status
      if (transactionId) {
        const paymentStatus = await checkPaymentStatus(transactionId);
        console.log('Payment status:', paymentStatus);
      }

      // Get order details
      const order = await getOrder(orderId);
      setOrderDetails(order);

      // Check order payment status
      if (order.paymentStatus === 'paid') {
        setStatus('success');
        setMessage('Payment successful! 🎉');
        
        // Clear localStorage
        localStorage.removeItem('currentTransaction');
        localStorage.removeItem('currentOrder');

        // Redirect to success page after 2 seconds
        setTimeout(() => {
          router.push(`/order/success?orderId=${orderId}`);
        }, 2000);

      } else if (order.paymentStatus === 'failed') {
        setStatus('failed');
        setMessage('Payment failed. Please try again.');
        
        // Redirect to retry page
        setTimeout(() => {
          router.push(`/order/retry?orderId=${orderId}`);
        }, 3000);

      } else {
        // Still pending - might need more time
        setStatus('pending');
        setMessage('Payment is being processed...');
        
        // Retry check after 3 seconds
        setTimeout(verifyPayment, 3000);
      }

    } catch (error) {
      console.error('Verification error:', error);
      setStatus('error');
      setMessage('Error verifying payment. Please contact support.');
    }
  };

  return (
    <div className="callback-container">
      <div className={`status-card ${status}`}>
        {status === 'processing' && (
          <div className="spinner"></div>
        )}
        
        {status === 'success' && (
          <div className="icon success">✓</div>
        )}
        
        {status === 'failed' && (
          <div className="icon failed">✗</div>
        )}
        
        {status === 'error' && (
          <div className="icon error">⚠</div>
        )}

        <h2>{message}</h2>

        {orderDetails && (
          <div className="order-info">
            <p>Order ID: {orderDetails._id}</p>
            <p>Amount: ₹{orderDetails.totalAmount}</p>
            <p>Status: {orderDetails.paymentStatus}</p>
          </div>
        )}

        {status === 'pending' && (
          <p className="note">Please wait, do not close this page...</p>
        )}
      </div>

      <style jsx>{`
        .callback-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
        }

        .status-card {
          background: white;
          padding: 3rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          text-align: center;
          max-width: 500px;
        }

        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #5f259f;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .icon {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3rem;
          margin: 0 auto 1rem;
          color: white;
        }

        .icon.success {
          background: #4caf50;
        }

        .icon.failed {
          background: #f44336;
        }

        .icon.error {
          background: #ff9800;
        }

        .order-info {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #f9f9f9;
          border-radius: 8px;
        }

        .order-info p {
          margin: 0.5rem 0;
        }

        .note {
          margin-top: 1rem;
          color: #666;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
```

---

## ✅ Order Success Page

Create `app/order/success/page.jsx`:

```javascript
// app/order/success/page.jsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getOrder } from '@/lib/api';
import Link from 'next/link';

export default function OrderSuccess() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const orderData = await getOrder(orderId);
      setOrder(orderData);
    } catch (error) {
      console.error('Error fetching order:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!order) {
    return <div>Order not found</div>;
  }

  return (
    <div className="success-container">
      <div className="success-card">
        <div className="success-icon">✓</div>
        <h1>Order Placed Successfully!</h1>
        
        <div className="order-details">
          <h2>Order Details</h2>
          <p><strong>Order ID:</strong> {order._id}</p>
          <p><strong>Total Amount:</strong> ₹{order.totalAmount}</p>
          <p><strong>Payment Method:</strong> {order.paymentMethod}</p>
          <p><strong>Payment Status:</strong> {order.paymentStatus}</p>
          <p><strong>Order Status:</strong> {order.orderStatus}</p>
        </div>

        <div className="actions">
          <Link href="/orders" className="btn-primary">
            View All Orders
          </Link>
          <Link href="/" className="btn-secondary">
            Continue Shopping
          </Link>
        </div>
      </div>

      <style jsx>{`
        .success-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: #f5f5f5;
        }

        .success-card {
          background: white;
          padding: 3rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          text-align: center;
          max-width: 600px;
        }

        .success-icon {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: #4caf50;
          color: white;
          font-size: 4rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
        }

        .order-details {
          margin: 2rem 0;
          padding: 1.5rem;
          background: #f9f9f9;
          border-radius: 8px;
          text-align: left;
        }

        .order-details p {
          margin: 0.5rem 0;
        }

        .actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-top: 2rem;
        }

        .btn-primary, .btn-secondary {
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
        }

        .btn-primary {
          background: #5f259f;
          color: white;
        }

        .btn-secondary {
          background: #e0e0e0;
          color: #333;
        }
      `}</style>
    </div>
  );
}
```

---

## 📝 Complete Example Usage

```javascript
// In your cart/checkout page
import Checkout from '@/components/Checkout';

export default function CheckoutPage() {
  const cart = [
    { variantId: '64abc123...', quantity: 2, price: 500 },
    { variantId: '64abc456...', quantity: 1, price: 1000 },
  ];
  
  const userId = 'USER_ID'; // Get from session/auth
  const addressId = 'ADDRESS_ID'; // Selected address

  return (
    <div>
      <h1>Checkout</h1>
      <Checkout 
        cart={cart}
        userId={userId}
        addressId={addressId}
      />
    </div>
  );
}
```

---

## 🔐 Important Notes

### Security:
- ✅ Never expose PhonePe credentials in frontend
- ✅ All sensitive operations happen in backend
- ✅ Frontend only receives payment URL and redirects
- ✅ Backend handles checksums and verification

### Error Handling:
- ✅ Handle network errors
- ✅ Handle payment failures
- ✅ Handle timeout scenarios
- ✅ Provide retry options

### User Experience:
- ✅ Show loading states
- ✅ Don't close callback page prematurely
- ✅ Verify payment before showing success
- ✅ Store transaction ID for tracking

---

## 🧪 Testing

### Local Testing:
1. Start backend: `npm run dev` (port 3000)
2. Start Next.js: `npm run dev` (port 3001)
3. Use PhonePe sandbox credentials
4. Test complete flow

### Use ngrok for Callback:
```bash
ngrok http 3000
# Update PHONEPE_CALLBACK_URL with ngrok URL
```

---

**Your Next.js integration is ready!** 🎉

For more details, see [PHONEPE_INTEGRATION.md](./PHONEPE_INTEGRATION.md)
