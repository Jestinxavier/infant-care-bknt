const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Online Shopping Backend API",
      version: "1.0.0",
      description:
        "Comprehensive API documentation for Online Shopping Backend with JWT authentication, product management, orders, payments (PhonePe), and more.",
      contact: {
        name: "API Support",
        email: "support@example.com",
      },
      license: {
        name: "ISC",
        url: "https://opensource.org/licenses/ISC",
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT}`,
        description: "Development server",
      },
      {
        url: "https://api.yourapp.com",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter JWT token obtained from login",
        },
      },
      schemas: {
        User: {
          type: "object",
          required: ["username", "email", "password"],
          properties: {
            _id: {
              type: "string",
              description: "Auto-generated user ID",
            },
            username: {
              type: "string",
              description: "Username",
              example: "johndoe",
            },
            email: {
              type: "string",
              format: "email",
              description: "User email",
              example: "john@example.com",
            },
            phone: {
              type: "string",
              description: "User phone number",
              example: "+91 9876543210",
            },
            password: {
              type: "string",
              format: "password",
              description: "User password (hashed)",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        Product: {
          type: "object",
          properties: {
            _id: {
              type: "string",
            },
            name: {
              type: "string",
              example: "Premium T-Shirt",
            },
            description: {
              type: "string",
              example: "High quality cotton t-shirt",
            },
            category: {
              type: "string",
              example: "Clothing",
            },
            brand: {
              type: "string",
              example: "Nike",
            },
            images: {
              type: "array",
              items: {
                type: "string",
              },
              example: ["https://cloudinary.com/image1.jpg"],
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        Variant: {
          type: "object",
          properties: {
            _id: {
              type: "string",
            },
            productId: {
              type: "string",
            },
            age: {
              type: "string",
              example: "M",
            },
            color: {
              type: "string",
              example: "Red",
            },
            price: {
              type: "number",
              example: 999,
            },
            stock: {
              type: "number",
              example: 50,
            },
            images: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        },
        Order: {
          type: "object",
          properties: {
            _id: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  productId: { type: "string" },
                  variantId: { type: "string" },
                  quantity: { type: "number" },
                  price: { type: "number" },
                },
              },
            },
            totalAmount: {
              type: "number",
              example: 1500,
            },
            addressId: {
              type: "string",
            },
            paymentStatus: {
              type: "string",
              enum: ["pending", "paid", "failed", "refunded"],
              example: "pending",
            },
            orderStatus: {
              type: "string",
              enum: ["processing", "shipped", "delivered", "cancelled"],
              example: "processing",
            },
            paymentMethod: {
              type: "string",
              enum: ["COD", "Razorpay", "Stripe", "PhonePe"],
              example: "PhonePe",
            },
          },
        },
        Address: {
          type: "object",
          properties: {
            _id: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            fullName: {
              type: "string",
              example: "John Doe",
            },
            phone: {
              type: "string",
              example: "9876543210",
            },
            houseName: {
              type: "string",
              example: "Green Villa",
              description: "House/Building name",
            },
            street: {
              type: "string",
              example: "123 Main Street",
              description: "Street address",
            },
            landmark: {
              type: "string",
              example: "Near City Mall",
              description: "Landmark for easy location",
            },
            addressLine1: {
              type: "string",
              example: "123 Main Street",
              description: "Address line 1 (kept for backward compatibility)",
            },
            addressLine2: {
              type: "string",
              example: "Near City Mall",
              description: "Address line 2 (kept for backward compatibility)",
            },
            city: {
              type: "string",
              example: "Mumbai",
            },
            state: {
              type: "string",
              example: "Maharashtra",
            },
            pincode: {
              type: "string",
              example: "400001",
            },
            postalCode: {
              type: "string",
              example: "400001",
              description: "Postal code (kept for backward compatibility)",
            },
            country: {
              type: "string",
              example: "India",
              default: "India",
            },
            isDefault: {
              type: "boolean",
              example: false,
            },
          },
        },
        Review: {
          type: "object",
          properties: {
            _id: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            variantId: {
              type: "string",
            },
            rating: {
              type: "number",
              minimum: 1,
              maximum: 5,
              example: 4,
            },
            comment: {
              type: "string",
              example: "Great product!",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        Payment: {
          type: "object",
          properties: {
            _id: {
              type: "string",
            },
            orderId: {
              type: "string",
            },
            userId: {
              type: "string",
            },
            amount: {
              type: "number",
              example: 1500,
            },
            method: {
              type: "string",
              enum: ["COD", "Razorpay", "Stripe", "Wallet", "PhonePe"],
              example: "PhonePe",
            },
            status: {
              type: "string",
              enum: ["pending", "success", "failed"],
              example: "pending",
            },
            transactionId: {
              type: "string",
              example: "TXN_123456789",
            },
            phonepeTransactionId: {
              type: "string",
              description: "PhonePe internal transaction ID",
              example: "T231221123456789",
            },
            phonepeResponse: {
              type: "object",
              description: "Full response from PhonePe",
            },
            phonepeRefundResponse: {
              type: "object",
              description: "Full refund response from PhonePe",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Error message",
            },
            error: {
              type: "string",
            },
          },
        },
        CheckUserResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            exists: {
              type: "boolean",
              example: true,
              description: "Whether the user exists with the given email",
            },
            message: {
              type: "string",
              example: "User exists with this email",
            },
          },
        },
        LoginOTPResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "OTP sent to your email. Please verify to login.",
            },
            email: {
              type: "string",
              format: "email",
              example: "john@example.com",
            },
            expiresIn: {
              type: "string",
              example: "10 minutes",
            },
          },
        },
        VerifyLoginOTPResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Login successful!",
            },
            accessToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            refreshToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            user: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  example: "64abc123def456789",
                },
                username: {
                  type: "string",
                  example: "johndoe",
                },
                email: {
                  type: "string",
                  format: "email",
                  example: "john@example.com",
                },
                role: {
                  type: "string",
                  example: "user",
                },
                isEmailVerified: {
                  type: "boolean",
                  example: true,
                },
              },
            },
          },
        },
        CartItem: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Cart item ID",
              example: "64abc123def456789",
            },
            productId: {
              oneOf: [
                { type: "string" },
                {
                  type: "object",
                  properties: {
                    _id: { type: "string" },
                    title: { type: "string" },
                    url_key: { type: "string" },
                    images: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              ],
              description: "Product ID or populated product object",
              example: "64abc123def456789",
            },
            variantId: {
              type: "string",
              nullable: true,
              description: "Variant ID (null for products without variants)",
              example: "variant_123",
            },
            quantity: {
              type: "number",
              minimum: 1,
              description: "Item quantity",
              example: 2,
            },
            priceSnapshot: {
              type: "number",
              minimum: 0,
              description: "Price at time of adding to cart",
              example: 999,
            },
            discountPriceSnapshot: {
              type: "number",
              nullable: true,
              minimum: 0,
              description: "Discounted price at time of adding to cart",
              example: 799,
            },
            titleSnapshot: {
              type: "string",
              description: "Product title at time of adding to cart",
              example: "Premium Organic Cotton Infant Jumpsuit",
            },
            imageSnapshot: {
              type: "string",
              description: "Product image URL at time of adding to cart",
              example: "https://picsum.photos/seed/red03/600",
            },
            skuSnapshot: {
              type: "string",
              nullable: true,
              description: "SKU at time of adding to cart",
              example: "CJ-RED-0-3",
            },
            attributesSnapshot: {
              type: "object",
              additionalProperties: { type: "string" },
              nullable: true,
              description: "Variant attributes at time of adding to cart",
              example: { color: "red", size: "0-3" },
            },
          },
        },
        Cart: {
          type: "object",
          properties: {
            cartId: {
              type: "string",
              description: "Unique cart identifier (format: cart_<nanoid>)",
              example: "cart_a1b2c3d4e5f6g7h8i9j0k",
            },
            userId: {
              type: "string",
              nullable: true,
              description: "User ID if cart belongs to authenticated user",
              example: "64abc123def456789",
            },
            items: {
              type: "array",
              items: {
                $ref: "#/components/schemas/CartItem",
              },
              description: "Array of cart items",
            },
            subtotal: {
              type: "number",
              minimum: 0,
              description: "Subtotal of all items",
              example: 1998,
            },
            tax: {
              type: "number",
              minimum: 0,
              description: "Tax amount",
              example: 0,
            },
            shippingEstimate: {
              type: "number",
              minimum: 0,
              description: "Estimated shipping cost",
              example: 0,
            },
            total: {
              type: "number",
              minimum: 0,
              description: "Total amount (subtotal + tax + shipping)",
              example: 1998,
            },
            itemCount: {
              type: "number",
              description: "Total number of items in cart",
              example: 2,
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Cart creation timestamp",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Cart last update timestamp",
            },
          },
        },
        AddItemToCartRequest: {
          type: "object",
          required: ["productId"],
          properties: {
            productId: {
              type: "string",
              description: "Product ID",
              example: "64abc123def456789",
            },
            variantId: {
              type: "string",
              nullable: true,
              description: "Variant ID (required for products with variants)",
              example: "variant_123",
            },
            quantity: {
              type: "number",
              minimum: 1,
              default: 1,
              description: "Quantity to add",
              example: 2,
            },
          },
        },
        UpdateItemQuantityRequest: {
          type: "object",
          required: ["quantity"],
          properties: {
            quantity: {
              type: "number",
              minimum: 0,
              description: "New quantity (0 to remove item)",
              example: 3,
            },
          },
        },
        MergeCartRequest: {
          type: "object",
          required: ["guestCartId", "userCartId"],
          properties: {
            guestCartId: {
              type: "string",
              description: "Guest cart ID to merge from",
              example: "cart_a1b2c3d4e5f6g7h8i9j0k",
            },
            userCartId: {
              type: "string",
              description: "User cart ID to merge into",
              example: "cart_z9y8x7w6v5u4t3s2r1q0p",
            },
          },
        },
        CartResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Item added to cart",
            },
            cart: {
              $ref: "#/components/schemas/Cart",
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Authentication",
        description: "User authentication and authorization endpoints",
      },
      {
        name: "Products",
        description: "Product management endpoints (Storefront)",
      },
      {
        name: "Variants",
        description: "Product variant management",
      },
      {
        name: "Filters",
        description: "Product filter options and configurations",
      },
      {
        name: "Orders",
        description: "Order management endpoints (Storefront)",
      },
      {
        name: "Payments",
        description: "Payment processing (PhonePe integration)",
      },
      {
        name: "Addresses",
        description: "User address management",
      },
      {
        name: "Reviews",
        description: "Product review endpoints",
      },
      {
        name: "Cart",
        description: "Shopping cart management endpoints",
      },
      {
        name: "Admin",
        description:
          "Admin dashboard API endpoints - Requires admin authentication. All endpoints are prefixed with /api/v1/admin (configurable via ADMIN_API_PREFIX env variable).",
      },
    ],
  },
  apis: ["./src/routes/*.js", "./src/controllers/**/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
