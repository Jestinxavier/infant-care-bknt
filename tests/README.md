# Backend Testing Suite

This directory contains the automated testing suite for the Online Shopping backend.

## 🏗️ Structure

- `setup.js`: Global Jest configuration, database management (MongoDB Memory Server), and global mocks (Cloudinary, emailService, etc.).
- `integration/`: End-to-end API tests verifying the interaction between routes, controllers, services, and the database.

## 🚀 Getting Started

### Prerequisites

Ensure you have the dependencies installed:
```bash
pnpm install
```

### Running Tests

Run the full suite:
```bash
pnpm test
```

Run tests in watch mode:
```bash
pnpm test:watch
```

Run a specific test file:
```bash
pnpm test tests/integration/auth.test.js
```

## 🛠️ Testing Stack

- **Framework**: [Jest](https://jestjs.io/)
- **API Assertions**: [SuperTest](https://github.com/ladjs/supertest)
- **In-Memory DB**: [mongodb-memory-server](https://github.com/nodkz/mongodb-memory-server)
- **Flow**: Each test suite uses a fresh, isolated in-memory database to ensure zero data leakage.
