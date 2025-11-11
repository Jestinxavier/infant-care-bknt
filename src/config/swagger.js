const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Online Shopping Backend API',
      version: '1.0.0',
      description: 'Comprehensive API documentation for Online Shopping Backend with JWT authentication, product management, orders, payments (PhonePe), and more.',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: 'https://api.yourapp.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from login',
        },
      },
      schemas: {
        User: {
          type: 'object',
          required: ['username', 'email', 'password'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated user ID',
            },
            username: {
              type: 'string',
              description: 'Username',
              example: 'johndoe',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email',
              example: 'john@example.com',
            },
            phone: {
              type: 'string',
              description: 'User phone number',
              example: '+91 9876543210',
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'User password (hashed)',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Product: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
            },
            name: {
              type: 'string',
              example: 'Premium T-Shirt',
            },
            description: {
              type: 'string',
              example: 'High quality cotton t-shirt',
            },
            category: {
              type: 'string',
              example: 'Clothing',
            },
            brand: {
              type: 'string',
              example: 'Nike',
            },
            images: {
              type: 'array',
              items: {
                type: 'string',
              },
              example: ['https://cloudinary.com/image1.jpg'],
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Variant: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
            },
            productId: {
              type: 'string',
            },
            age: {
              type: 'string',
              example: 'M',
            },
            color: {
              type: 'string',
              example: 'Red',
            },
            price: {
              type: 'number',
              example: 999,
            },
            stock: {
              type: 'number',
              example: 50,
            },
            images: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
        Order: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
            },
            userId: {
              type: 'string',
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string' },
                  variantId: { type: 'string' },
                  quantity: { type: 'number' },
                  price: { type: 'number' },
                },
              },
            },
            totalAmount: {
              type: 'number',
              example: 1500,
            },
            addressId: {
              type: 'string',
            },
            paymentStatus: {
              type: 'string',
              enum: ['pending', 'paid', 'failed', 'refunded'],
              example: 'pending',
            },
            orderStatus: {
              type: 'string',
              enum: ['processing', 'shipped', 'delivered', 'cancelled'],
              example: 'processing',
            },
            paymentMethod: {
              type: 'string',
              enum: ['COD', 'Razorpay', 'Stripe', 'PhonePe'],
              example: 'PhonePe',
            },
          },
        },
        Address: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
            },
            userId: {
              type: 'string',
            },
            fullName: {
              type: 'string',
              example: 'John Doe',
            },
            phone: {
              type: 'string',
              example: '9876543210',
            },
            houseName: {
              type: 'string',
              example: 'Green Villa',
              description: 'House/Building name',
            },
            street: {
              type: 'string',
              example: '123 Main Street',
              description: 'Street address',
            },
            landmark: {
              type: 'string',
              example: 'Near City Mall',
              description: 'Landmark for easy location',
            },
            addressLine1: {
              type: 'string',
              example: '123 Main Street',
              description: 'Address line 1 (kept for backward compatibility)',
            },
            addressLine2: {
              type: 'string',
              example: 'Near City Mall',
              description: 'Address line 2 (kept for backward compatibility)',
            },
            city: {
              type: 'string',
              example: 'Mumbai',
            },
            state: {
              type: 'string',
              example: 'Maharashtra',
            },
            pincode: {
              type: 'string',
              example: '400001',
            },
            postalCode: {
              type: 'string',
              example: '400001',
              description: 'Postal code (kept for backward compatibility)',
            },
            country: {
              type: 'string',
              example: 'India',
              default: 'India',
            },
            isDefault: {
              type: 'boolean',
              example: false,
            },
          },
        },
        Review: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
            },
            userId: {
              type: 'string',
            },
            variantId: {
              type: 'string',
            },
            rating: {
              type: 'number',
              minimum: 1,
              maximum: 5,
              example: 4,
            },
            comment: {
              type: 'string',
              example: 'Great product!',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
            },
            orderId: {
              type: 'string',
            },
            userId: {
              type: 'string',
            },
            amount: {
              type: 'number',
              example: 1500,
            },
            method: {
              type: 'string',
              enum: ['COD', 'Razorpay', 'Stripe', 'Wallet', 'PhonePe'],
              example: 'PhonePe',
            },
            status: {
              type: 'string',
              enum: ['pending', 'success', 'failed'],
              example: 'pending',
            },
            transactionId: {
              type: 'string',
              example: 'TXN_123456789',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Error message',
            },
            error: {
              type: 'string',
            },
          },
        },
        CheckUserResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            exists: {
              type: 'boolean',
              example: true,
              description: 'Whether the user exists with the given email',
            },
            message: {
              type: 'string',
              example: 'User exists with this email',
            },
          },
        },
        LoginOTPResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'OTP sent to your email. Please verify to login.',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john@example.com',
            },
            expiresIn: {
              type: 'string',
              example: '10 minutes',
            },
          },
        },
        VerifyLoginOTPResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'Login successful!',
            },
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            user: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  example: '64abc123def456789',
                },
                username: {
                  type: 'string',
                  example: 'johndoe',
                },
                email: {
                  type: 'string',
                  format: 'email',
                  example: 'john@example.com',
                },
                role: {
                  type: 'string',
                  example: 'user',
                },
                isEmailVerified: {
                  type: 'boolean',
                  example: true,
                },
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization endpoints',
      },
      {
        name: 'Products',
        description: 'Product management endpoints',
      },
      {
        name: 'Variants',
        description: 'Product variant management',
      },
      {
        name: 'Orders',
        description: 'Order management endpoints',
      },
      {
        name: 'Payments',
        description: 'Payment processing (PhonePe integration)',
      },
      {
        name: 'Addresses',
        description: 'User address management',
      },
      {
        name: 'Reviews',
        description: 'Product review endpoints',
      },
    ],
  },
  apis: ['./src/routes/*.js', './src/controllers/**/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
