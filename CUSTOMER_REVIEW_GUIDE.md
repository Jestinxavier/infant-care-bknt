# 📝 Customer Review System Guide

## Overview

Complete customer review system that allows authenticated users to review **only products they have purchased and received**. The system includes full CRUD operations with proper authentication and authorization.

---

## 🎯 Features

✅ **Purchased Products Verification** - Only customers who received products can review  
✅ **Duplicate Prevention** - One review per product per order  
✅ **Full CRUD Operations** - Create, Read, Update, Delete reviews  
✅ **JWT Authentication** - Secure routes with token-based auth  
✅ **Review Status Tracking** - See which products you've reviewed  
✅ **Average Rating Calculation** - Automatic rating aggregation  
✅ **Comprehensive Swagger Documentation** - Interactive API testing  

---

## 📋 API Endpoints

### 1. Get Purchased Products for Review (Authenticated)

**Endpoint:** `GET /api/v1/review/my-purchases`  
**Authentication:** Required (Bearer Token)

Returns all products the customer has purchased (delivered orders only) with review status.

**Headers:**
```json
{
  "Authorization": "Bearer <your_jwt_token>"
}
```

**Response Example:**
```json
{
  "success": true,
  "totalPurchased": 3,
  "purchasedProducts": [
    {
      "orderId": "64abc123def456791",
      "orderDate": "2025-10-15T10:30:00.000Z",
      "variantId": "64abc123def456790",
      "productId": "64abc123def456788",
      "productName": "Nike Air Max 270",
      "productImage": "https://cloudinary.com/image1.jpg",
      "variantDetails": {
        "size": "42",
        "color": "Black",
        "price": 12999
      },
      "quantity": 1,
      "isReviewed": false,
      "review": null
    },
    {
      "orderId": "64abc123def456792",
      "orderDate": "2025-10-10T14:20:00.000Z",
      "variantId": "64abc123def456793",
      "productId": "64abc123def456794",
      "productName": "Adidas Ultraboost",
      "productImage": "https://cloudinary.com/image2.jpg",
      "variantDetails": {
        "size": "43",
        "color": "White",
        "price": 15999
      },
      "quantity": 2,
      "isReviewed": true,
      "review": {
        "_id": "64abc123def456795",
        "rating": 5,
        "review": "Excellent product!",
        "createdAt": "2025-10-11T09:00:00.000Z"
      }
    }
  ]
}
```

**Use Case:**
- Display "Write a Review" button for products not yet reviewed
- Show existing reviews with "Edit" option
- Perfect for "My Orders" page review section

---

### 2. Add Review (Authenticated)

**Endpoint:** `POST /api/v1/review/add`  
**Authentication:** Required (Bearer Token)

Add a review for a purchased and delivered product.

**Headers:**
```json
{
  "Authorization": "Bearer <your_jwt_token>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "variantId": "64abc123def456790",
  "orderId": "64abc123def456791",
  "rating": 5,
  "review": "Excellent product! Highly recommend. Great quality and fast delivery."
}
```

**Field Validation:**
- `variantId` (required): Product variant ID
- `orderId` (required): Order ID where product was purchased
- `rating` (required): Number between 1-5
- `review` (optional): Review text

**Response Example:**
```json
{
  "success": true,
  "message": "✅ Review added successfully",
  "review": {
    "_id": "64abc123def456795",
    "userId": {
      "_id": "64abc123def456789",
      "username": "john_doe",
      "email": "john@example.com"
    },
    "variantId": {
      "_id": "64abc123def456790",
      "size": "42",
      "color": "Black",
      "productId": {
        "_id": "64abc123def456788",
        "name": "Nike Air Max 270",
        "images": ["https://cloudinary.com/image1.jpg"]
      }
    },
    "orderId": "64abc123def456791",
    "rating": 5,
    "review": "Excellent product! Highly recommend. Great quality and fast delivery.",
    "createdAt": "2025-10-18T10:30:00.000Z",
    "updatedAt": "2025-10-18T10:30:00.000Z"
  }
}
```

**Error Responses:**

**400 - Validation Error:**
```json
{
  "success": false,
  "message": "Rating must be between 1 and 5"
}
```

**400 - Already Reviewed:**
```json
{
  "success": false,
  "message": "You have already reviewed this product"
}
```

**403 - Not Delivered:**
```json
{
  "success": false,
  "message": "You can only review delivered products"
}
```

**403 - Not in Order:**
```json
{
  "success": false,
  "message": "This variant is not part of your order"
}
```

---

### 3. Get My Reviews (Authenticated)

**Endpoint:** `GET /api/v1/review/my-reviews`  
**Authentication:** Required (Bearer Token)

Get all reviews created by the authenticated user.

**Headers:**
```json
{
  "Authorization": "Bearer <your_jwt_token>"
}
```

**Response Example:**
```json
{
  "success": true,
  "totalReviews": 2,
  "reviews": [
    {
      "_id": "64abc123def456795",
      "userId": "64abc123def456789",
      "variantId": {
        "_id": "64abc123def456790",
        "size": "42",
        "color": "Black",
        "productId": {
          "_id": "64abc123def456788",
          "name": "Nike Air Max 270",
          "images": ["https://cloudinary.com/image1.jpg"],
          "category": "Shoes"
        }
      },
      "orderId": {
        "_id": "64abc123def456791",
        "placedAt": "2025-10-15T10:30:00.000Z",
        "orderStatus": "delivered"
      },
      "rating": 5,
      "review": "Excellent product!",
      "createdAt": "2025-10-16T09:00:00.000Z",
      "updatedAt": "2025-10-16T09:00:00.000Z"
    }
  ]
}
```

---

### 4. Update My Review (Authenticated)

**Endpoint:** `PUT /api/v1/review/my-review/:reviewId`  
**Authentication:** Required (Bearer Token)

Update a review created by the authenticated user.

**Headers:**
```json
{
  "Authorization": "Bearer <your_jwt_token>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "rating": 4,
  "review": "Updated review text - Good product but could be better"
}
```

**Notes:**
- Both fields are optional, you can update one or both
- Users can only update their own reviews

**Response Example:**
```json
{
  "success": true,
  "message": "✅ Review updated successfully",
  "review": {
    "_id": "64abc123def456795",
    "userId": "64abc123def456789",
    "variantId": {
      "_id": "64abc123def456790",
      "productId": {
        "name": "Nike Air Max 270",
        "images": ["https://cloudinary.com/image1.jpg"]
      }
    },
    "orderId": {
      "_id": "64abc123def456791",
      "placedAt": "2025-10-15T10:30:00.000Z"
    },
    "rating": 4,
    "review": "Updated review text - Good product but could be better",
    "createdAt": "2025-10-16T09:00:00.000Z",
    "updatedAt": "2025-10-18T11:00:00.000Z"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Review not found or you don't have permission to update it"
}
```

---

### 5. Delete My Review (Authenticated)

**Endpoint:** `DELETE /api/v1/review/my-review/:reviewId`  
**Authentication:** Required (Bearer Token)

Delete a review created by the authenticated user.

**Headers:**
```json
{
  "Authorization": "Bearer <your_jwt_token>"
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "✅ Review deleted successfully"
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Review not found or you don't have permission to delete it"
}
```

---

### 6. Get Variant Reviews (Public)

**Endpoint:** `GET /api/v1/review/variant/:variantId`  
**Authentication:** Not Required

Get all reviews for a specific product variant with average rating.

**Response Example:**
```json
{
  "success": true,
  "totalReviews": 15,
  "averageRating": 4.3,
  "reviews": [
    {
      "_id": "64abc123def456795",
      "userId": {
        "_id": "64abc123def456789",
        "username": "john_doe"
      },
      "variantId": "64abc123def456790",
      "orderId": "64abc123def456791",
      "rating": 5,
      "review": "Excellent product!",
      "createdAt": "2025-10-16T09:00:00.000Z",
      "updatedAt": "2025-10-16T09:00:00.000Z"
    },
    {
      "_id": "64abc123def456796",
      "userId": {
        "_id": "64abc123def456800",
        "username": "jane_smith"
      },
      "variantId": "64abc123def456790",
      "orderId": "64abc123def456801",
      "rating": 4,
      "review": "Good quality, worth the price",
      "createdAt": "2025-10-15T14:20:00.000Z",
      "updatedAt": "2025-10-15T14:20:00.000Z"
    }
  ]
}
```

---

## 🔐 Authentication

All customer review endpoints (except public variant reviews) require JWT authentication.

### Getting the JWT Token

1. **Login:**
```bash
POST /api/v1/auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "64abc123def456789",
    "email": "user@example.com"
  }
}
```

2. **Use Token in Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🧪 Testing with Postman/Thunder Client

### 1. Test Add Review

```bash
POST http://localhost:3000/api/v1/review/add
Headers:
  Authorization: Bearer <your_token>
  Content-Type: application/json
Body:
{
  "variantId": "64abc123def456790",
  "orderId": "64abc123def456791",
  "rating": 5,
  "review": "Amazing product! Exceeded my expectations."
}
```

### 2. Test Get Purchased Products

```bash
GET http://localhost:3000/api/v1/review/my-purchases
Headers:
  Authorization: Bearer <your_token>
```

### 3. Test Update Review

```bash
PUT http://localhost:3000/api/v1/review/my-review/64abc123def456795
Headers:
  Authorization: Bearer <your_token>
  Content-Type: application/json
Body:
{
  "rating": 4,
  "review": "Updated review text"
}
```

---

## 🎨 Frontend Integration Examples

### React Example - Display Review Form

```jsx
import { useState, useEffect } from 'react';

function ProductReviewForm({ productId, variantId, orderId }) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/v1/review/add', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          variantId,
          orderId,
          rating,
          review
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert('✅ Review submitted successfully!');
        // Redirect or update UI
      } else {
        alert(`❌ ${data.message}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Rating:</label>
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Very Good</option>
          <option value="3">3 - Good</option>
          <option value="2">2 - Fair</option>
          <option value="1">1 - Poor</option>
        </select>
      </div>
      
      <div>
        <label>Review:</label>
        <textarea 
          value={review} 
          onChange={(e) => setReview(e.target.value)}
          placeholder="Share your experience with this product..."
          rows="4"
        />
      </div>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit Review'}
      </button>
    </form>
  );
}
```

### Fetch Purchased Products

```jsx
function MyPurchasedProducts() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const fetchPurchasedProducts = async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/v1/review/my-purchases', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        setProducts(data.purchasedProducts);
      }
    };

    fetchPurchasedProducts();
  }, []);

  return (
    <div>
      <h2>My Purchased Products</h2>
      {products.map(product => (
        <div key={product.variantId}>
          <h3>{product.productName}</h3>
          <img src={product.productImage} alt={product.productName} />
          <p>Size: {product.variantDetails.size}</p>
          <p>Color: {product.variantDetails.color}</p>
          
          {product.isReviewed ? (
            <div>
              <p>✅ You reviewed this product</p>
              <p>Rating: {product.review.rating}/5</p>
              <p>{product.review.review}</p>
              <button>Edit Review</button>
            </div>
          ) : (
            <button>Write a Review</button>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 🔄 Review Workflow

```mermaid
graph TB
    A[Customer Places Order] --> B[Order Status: Processing]
    B --> C[Order Status: Shipped]
    C --> D[Order Status: Delivered]
    D --> E[Customer Can Write Review]
    E --> F{Review Action}
    F -->|Create| G[Add New Review]
    F -->|Update| H[Edit Existing Review]
    F -->|Delete| I[Remove Review]
    G --> J[Review Saved]
    H --> J
    I --> K[Review Deleted]
```

---

## ✅ Business Rules

1. **Purchase Verification:**
   - User must have placed an order
   - Order must contain the specific variant
   - Order status must be "delivered"

2. **Duplicate Prevention:**
   - One review per variant per order
   - User cannot review same product twice from same order

3. **Authorization:**
   - Users can only update/delete their own reviews
   - Reviews are tied to authenticated user

4. **Rating Validation:**
   - Rating must be between 1 and 5
   - Rating is required, review text is optional

---

## 📊 Database Schema

### Review Model
```javascript
{
  userId: ObjectId (ref: User),
  variantId: ObjectId (ref: Variant),
  orderId: ObjectId (ref: Order),
  rating: Number (1-5),
  review: String (optional),
  timestamps: true
}
```

### Relationships
- Review → User (userId)
- Review → Variant (variantId)
- Review → Order (orderId)
- Variant → Product (productId)

---

## 🐛 Common Issues & Solutions

### Issue: "Order not found or unauthorized"
**Solution:** Make sure you're using the correct orderId where you actually purchased this product.

### Issue: "You can only review delivered products"
**Solution:** Wait until order status is "delivered". Contact admin to update order status if needed.

### Issue: "You have already reviewed this product"
**Solution:** Use the update endpoint instead of create. One review per product per order.

### Issue: 401 Unauthorized
**Solution:** 
- Check if JWT token is valid
- Ensure token is in header: `Authorization: Bearer <token>`
- Token might be expired, login again

---

## 📚 Swagger Documentation

Access interactive API documentation at:
```
http://localhost:3000/api-docs
```

Navigate to the **Reviews** section to:
- ✅ See all endpoints
- ✅ Test requests directly
- ✅ View request/response schemas
- ✅ Authorize with JWT token

---

## 🎯 Best Practices

1. **Always validate JWT token** before making requests
2. **Show review button only for delivered products**
3. **Display average rating** on product pages
4. **Allow editing** within reasonable timeframe
5. **Moderate inappropriate content** (add admin moderation)
6. **Send email notifications** when review is added
7. **Implement pagination** for large review lists

---

## 🚀 Future Enhancements

- [ ] Add review images upload
- [ ] Add review helpfulness voting (helpful/not helpful)
- [ ] Admin moderation system
- [ ] Review verification badges (verified purchase)
- [ ] Email notifications for new reviews
- [ ] Review reply feature (seller response)
- [ ] Review analytics dashboard
- [ ] Review spam detection

---

**Last Updated:** 2025-10-18  
**Version:** 1.0.0  
**API Base URL:** `http://localhost:3000/api/v1`
