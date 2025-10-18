# 📝 Review API Quick Reference

## Authentication
All endpoints (except public variant reviews) require JWT token:
```
Authorization: Bearer <your_jwt_token>
```

---

## 🔗 Endpoints Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/review/my-purchases` | ✅ | Get purchased products for review |
| `POST` | `/api/v1/review/add` | ✅ | Add review for purchased product |
| `GET` | `/api/v1/review/my-reviews` | ✅ | Get all my reviews |
| `PUT` | `/api/v1/review/my-review/:reviewId` | ✅ | Update my review |
| `DELETE` | `/api/v1/review/my-review/:reviewId` | ✅ | Delete my review |
| `GET` | `/api/v1/review/variant/:variantId` | ❌ | Get all reviews for variant (Public) |

---

## 📋 Quick Examples

### 1️⃣ Get My Purchased Products
```bash
GET http://localhost:3000/api/v1/review/my-purchases
Headers: Authorization: Bearer <token>
```

### 2️⃣ Add Review
```bash
POST http://localhost:3000/api/v1/review/add
Headers: 
  Authorization: Bearer <token>
  Content-Type: application/json
Body:
{
  "variantId": "64abc123def456790",
  "orderId": "64abc123def456791",
  "rating": 5,
  "review": "Great product!"
}
```

### 3️⃣ Get My Reviews
```bash
GET http://localhost:3000/api/v1/review/my-reviews
Headers: Authorization: Bearer <token>
```

### 4️⃣ Update Review
```bash
PUT http://localhost:3000/api/v1/review/my-review/64abc123def456795
Headers: 
  Authorization: Bearer <token>
  Content-Type: application/json
Body:
{
  "rating": 4,
  "review": "Updated review"
}
```

### 5️⃣ Delete Review
```bash
DELETE http://localhost:3000/api/v1/review/my-review/64abc123def456795
Headers: Authorization: Bearer <token>
```

### 6️⃣ Get Variant Reviews (Public)
```bash
GET http://localhost:3000/api/v1/review/variant/64abc123def456790
```

---

## ✅ Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Review Created |
| `400` | Bad Request (validation error, already reviewed) |
| `401` | Unauthorized (missing/invalid token) |
| `403` | Forbidden (not purchased, not delivered) |
| `404` | Review Not Found |
| `500` | Server Error |

---

## 🎯 Business Rules

✅ Must be authenticated  
✅ Can only review delivered products  
✅ Can only review purchased products  
✅ One review per product per order  
✅ Rating must be 1-5  
✅ Can only edit/delete own reviews  

---

## 📖 Full Documentation

See [`CUSTOMER_REVIEW_GUIDE.md`](CUSTOMER_REVIEW_GUIDE.md) for complete details.

**Swagger Docs:** http://localhost:3000/api-docs
