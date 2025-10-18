# 💳 Multi-Payment Gateway Guide

Your backend now supports **multiple payment gateways**! Users can choose their preferred payment method.

---

## 🎯 Supported Payment Methods

| Method | Status | Type | When to Use |
|--------|--------|------|-------------|
| **COD** | ✅ Active | Cash | Users who prefer cash payment |
| **PhonePe** | ✅ Active | UPI/Wallet | UPI, PhonePe Wallet users |
| **Razorpay** | ✅ Active | Cards/UPI/Wallets | All online payment methods |
| **Stripe** | 🔜 Coming | Cards | International payments |

---

## 🔄 How It Works

### User Selects Payment Method

```javascript
// Frontend - User chooses payment method
const paymentMethods = [
  { id: 'cod', name: 'Cash on Delivery', icon: '💵' },
  { id: 'phonepe', name: 'PhonePe', icon: '📱' },
  { id: 'razorpay', name: 'Razorpay (Card/UPI/Wallet)', icon: '💳' },
];
```

### Backend Handles Different Methods

```javascript
// Backend automatically routes based on paymentMethod
if (paymentMethod === "PhonePe") {
  // PhonePe flow
} else if (paymentMethod === "Razorpay") {
  // Razorpay flow
} else if (paymentMethod === "COD") {
  // COD flow
}
```

---

## 📊 Payment Flow Comparison

### PhonePe Flow
```
Create Order → Init PhonePe → Redirect to PhonePe Page →
User Pays → PhonePe Callback → Backend Updates → Success
```

**Best for:**
- UPI payments
- PhonePe wallet users
- Quick checkout

### Razorpay Flow
```
Create Order → Create Razorpay Order → Open Razorpay Modal →
User Pays → Get Signature → Verify on Backend → Success
```

**Best for:**
- Card payments
- Multiple payment options
- Better conversion rates
- All UPI apps, wallets, netbanking

### COD Flow
```
Create Order → Mark as COD → Success
(Payment collected on delivery)
```

**Best for:**
- Users without online payment
- High-value orders (trust)
- Rural areas

---

## 🎨 Frontend Integration

### Complete Checkout Component

```javascript
// components/Checkout.jsx
'use client';

import { useState } from 'react';
import { createOrder, initPhonePePayment, createRazorpayOrder } from '@/lib/api';

export default function Checkout({ cart, userId, addressId, userDetails }) {
  const [selectedMethod, setSelectedMethod] = useState('razorpay');
  const [loading, setLoading] = useState(false);

  const paymentMethods = [
    {
      id: 'cod',
      name: 'Cash on Delivery',
      icon: '💵',
      description: 'Pay when you receive'
    },
    {
      id: 'phonepe',
      name: 'PhonePe',
      icon: '📱',
      description: 'UPI, PhonePe Wallet'
    },
    {
      id: 'razorpay',
      name: 'Cards / UPI / Wallets',
      icon: '💳',
      description: 'Credit/Debit Cards, All UPI, Wallets'
    }
  ];

  const handlePayment = async () => {
    setLoading(true);

    try {
      // Step 1: Create Order
      const orderData = {
        userId,
        items: cart.map(item => ({
          variantId: item.variantId,
          quantity: item.quantity
        })),
        addressId,
        paymentMethod: selectedMethod === 'cod' ? 'COD' : 
                       selectedMethod === 'phonepe' ? 'PhonePe' : 'Razorpay'
      };

      const orderResult = await createOrder(orderData);
      const { order } = orderResult;

      // Step 2: Handle based on method
      if (selectedMethod === 'cod') {
        // COD - Direct success
        window.location.href = `/order/success?orderId=${order._id}`;
      } 
      else if (selectedMethod === 'phonepe') {
        // PhonePe flow
        const paymentData = {
          orderId: order._id,
          amount: order.totalAmount,
          userId: userId,
          userPhone: userDetails.phone,
          userName: userDetails.name
        };

        const payment = await initPhonePePayment(paymentData);
        
        // Redirect to PhonePe
        window.location.href = payment.data.paymentUrl;
      } 
      else if (selectedMethod === 'razorpay') {
        // Razorpay flow
        const razorpayData = {
          orderId: order._id,
          amount: order.totalAmount,
          userId: userId
        };

        const razorpayResult = await createRazorpayOrder(razorpayData);
        const { razorpayOrderId, keyId } = razorpayResult.data;

        // Open Razorpay checkout
        const options = {
          key: keyId,
          amount: order.totalAmount * 100,
          currency: 'INR',
          name: 'Your Store',
          order_id: razorpayOrderId,
          handler: async (response) => {
            // Verify payment
            await verifyRazorpayPayment(response, order._id);
          },
          prefill: {
            name: userDetails.name,
            email: userDetails.email,
            contact: userDetails.phone
          },
          theme: { color: '#5f259f' }
        };

        const razorpay = new window.Razorpay(options);
        razorpay.open();
      }

    } catch (error) {
      console.error('Payment error:', error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="checkout">
      <h2>Choose Payment Method</h2>

      <div className="payment-methods">
        {paymentMethods.map(method => (
          <div
            key={method.id}
            className={`method-card ${selectedMethod === method.id ? 'selected' : ''}`}
            onClick={() => setSelectedMethod(method.id)}
          >
            <div className="icon">{method.icon}</div>
            <div className="details">
              <h3>{method.name}</h3>
              <p>{method.description}</p>
            </div>
            <input
              type="radio"
              checked={selectedMethod === method.id}
              onChange={() => setSelectedMethod(method.id)}
            />
          </div>
        ))}
      </div>

      <button
        onClick={handlePayment}
        disabled={loading}
        className="pay-button"
      >
        {loading ? 'Processing...' : 'Proceed to Pay'}
      </button>
    </div>
  );
}
```

---

## 🔧 Configuration

### Environment Variables

Create `.env` file with ALL gateway credentials:

```env
# PhonePe
PHONEPE_MERCHANT_ID=your_merchant_id
PHONEPE_SALT_KEY=your_salt_key
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=development
PHONEPE_REDIRECT_URL=http://localhost:3001/payment/callback
PHONEPE_CALLBACK_URL=http://localhost:3000/api/v1/payments/phonepe/callback

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxx
RAZORPAY_CURRENCY=INR
```

### Next.js `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

---

## 📊 Comparison Table

| Feature | COD | PhonePe | Razorpay |
|---------|-----|---------|----------|
| **Setup Complexity** | Easy | Medium | Easy |
| **User Experience** | Simple | Good | Excellent |
| **Payment Options** | Cash only | UPI, Wallet | Cards, UPI, Wallets, NetBanking |
| **Transaction Fee** | None | ~2% | ~2% |
| **Settlement Time** | On delivery | T+1 day | T+1 day |
| **Refunds** | Manual | Instant | Instant |
| **International** | ❌ | ❌ | ✅ |
| **Best For** | Rural/Trust | UPI users | All users |

---

## 🎯 Recommendations

### When to Use Each:

**COD:**
- First-time customers
- High-value orders (builds trust)
- Areas with low digital payment adoption

**PhonePe:**
- Users who prefer UPI
- Quick checkout needed
- PhonePe wallet users

**Razorpay:**
- Maximum conversion
- Users want multiple options
- Card payments needed
- Business/corporate buyers

### Default Strategy:

```javascript
// Show all methods, but highlight Razorpay for better conversion
const recommended = 'razorpay';
```

---

## 🔐 Security Considerations

### All Gateways:
- ✅ HTTPS in production
- ✅ Signature verification
- ✅ Amount validation
- ✅ Transaction logging

### PhonePe Specific:
- SHA256 checksum validation
- Salt key kept secret
- Callback verification

### Razorpay Specific:
- Signature verification with HMAC
- Key secret never exposed
- Webhook signature check

---

## 📈 Analytics & Tracking

### Track Payment Method Usage:

```javascript
// Add analytics to track which method is popular
const trackPaymentMethod = (method) => {
  analytics.track('payment_method_selected', {
    method: method,
    timestamp: new Date()
  });
};
```

### Monitor Success Rates:

```javascript
// Track success/failure by method
const paymentMetrics = {
  phonepe: { success: 0, failed: 0 },
  razorpay: { success: 0, failed: 0 },
  cod: { success: 0, failed: 0 }
};
```

---

## 🆘 Troubleshooting

### Issue: User confused about which to choose

**Solution:**
- Add clear descriptions
- Show payment options icons
- Highlight recommended method
- Add "What's this?" tooltips

### Issue: One gateway down

**Solution:**
- Detect gateway status
- Disable temporarily
- Show message: "Currently unavailable"
- Suggest alternative

### Issue: Different fees

**Solution:**
- Show fee info upfront
- Let users compare
- Optionally pass fees to customer

---

## 📚 Documentation Links

### PhonePe:
- [PhonePe Integration Guide](./PHONEPE_INTEGRATION.md)
- [PhonePe Testing Guide](./PHONEPE_TESTING_GUIDE.md)
- [PhonePe Credentials Guide](./PHONEPE_CREDENTIALS_GUIDE.md)
- [Next.js PhonePe Integration](./NEXTJS_PHONEPE_INTEGRATION.md)

### Razorpay:
- [Razorpay Integration Guide](./RAZORPAY_INTEGRATION.md)
- [Environment Variables](./.env.razorpay.example)

### General:
- [Main README](./readme.md)
- [Swagger API Docs](http://localhost:3000/api-docs)

---

## ✅ Quick Start Checklist

### Backend Setup:
- [x] PhonePe controller created
- [x] Razorpay controller created
- [x] Payment routes added
- [x] Models updated
- [x] Environment variables configured

### Get Credentials:
- [ ] PhonePe: https://business.phonepe.com/
- [ ] Razorpay: https://dashboard.razorpay.com/

### Frontend Setup:
- [ ] Add Razorpay script
- [ ] Create checkout component
- [ ] Handle all payment methods
- [ ] Add callback pages

### Testing:
- [ ] Test COD flow
- [ ] Test PhonePe sandbox
- [ ] Test Razorpay test mode
- [ ] Test all success/failure scenarios

---

## 🎉 Benefits of Multi-Gateway

### For Business:
- ✅ Higher conversion rates
- ✅ Backup if one gateway fails
- ✅ More payment options = more sales
- ✅ Reach different user segments

### For Users:
- ✅ Choose preferred method
- ✅ Flexibility
- ✅ Better trust
- ✅ Convenient checkout

---

**You now have a complete multi-payment gateway system!** 🚀

Users can choose between COD, PhonePe, and Razorpay based on their preference!
