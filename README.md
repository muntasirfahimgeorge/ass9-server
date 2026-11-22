# FixMate API – Backend Server

FixMate is a Smart Device and Home Appliance Repair Service Platform that connects customers with technicians for reliable repair services.

This repository contains the backend REST API for FixMate. It manages authentication, users, services, repair bookings, payment processing, and administrative operations.

## Live Deployment

**Frontend URL:** https://ass9-client.vercel.app/

**Backend API URL:** https://fixmate-server1.onrender.com/api

**Backend Health Check:** https://fixmate-server1.onrender.com/api/health

## Project Repositories

- **Frontend Repository:** https://github.com/muntasirfahimgeorge/ass9-client
- **Backend Repository:** https://github.com/muntasirfahimgeorge/ass9-server

## Features

- Role-based authentication and authorization.
- Customer, technician, and admin access control.
- User profile management.
- Service creation, updating, deletion, and approval.
- Service availability management.
- Server-side service search, filtering, and sorting.
- Repair booking creation and management.
- Booking status transition validation.
- Customer booking cancellation for eligible requests.
- Stripe Checkout integration in test mode.
- Payment verification and webhook handling.
- Payment records stored in MongoDB.
- Admin dashboard APIs for platform management.
- Centralized error handling.
- Protected API routes and role-based middleware.

## Technology Stack

- **Runtime:** Node.js
- **Backend Framework:** Express.js 5
- **Database:** MongoDB
- **Language:** JavaScript (ES Modules)
- **JWT Verification:** JOSE (`jose`)
- **JWKS Integration:** JWKS
- **Payment Gateway:** Stripe
- **Environment Configuration:** dotenv
- **Cross-Origin Resource Sharing:** CORS
- **Testing:** Node.js built-in test runner

## Requirements

Before running the project, make sure you have:

- Node.js installed.
- npm installed.
- MongoDB database.
- Stripe account for test-mode payments.
- FixMate frontend application.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/muntasirfahimgeorge/ass9-server.git
```

### 2. Navigate to the Project Directory

```bash
cd ass9-server
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the project root.

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

If `.env.example` is unavailable, create `.env` manually and configure the variables required by the backend.

### 5. Environment Variables

Configure the following variables according to your project setup:

| Variable | Description |
|---|---|
| `PORT` | Backend server port. Default: 5000 |
| `DB_URI` | MongoDB connection string |
| `CLIENT_URL` | Frontend application URL |
| `BETTER_AUTH_URL` | Better Auth frontend base URL |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

Use the exact variable names required by the server source code and `.env.example`.

**Important:** Never commit `.env` files, database credentials, JWT secrets, or Stripe secret keys to GitHub.

## Running the Server

### Development Mode

Start the server with Node.js watch mode:

```bash
npm run dev
```

### Production Mode

Start the server:

```bash
npm start
```

By default, the API runs at:

```text
http://localhost:5000
```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the server using Node.js watch mode |
| `npm start` | Starts the server in production mode |
| `npm test` | Runs the automated test suite |

## Health Check

**Endpoint:**

```http
GET /api/health
```

**Live Health Check:**

https://fixmate-server1.onrender.com/api/health

This endpoint checks whether the backend API is running.

## API Route Groups

All application API routes are mounted under `/api`.

| Route | Description |
|---|---|
| `/api/health` | Backend health check |
| `/api/users` | User profile management |
| `/api/services` | Service listing and management |
| `/api/bookings` | Repair booking management |
| `/api/payments` | Stripe Checkout and payment verification |
| `/api/admin` | Administrative management |

## Authentication and Authorization

FixMate supports three user roles:

- **Customer:** Can browse services, create bookings, track repair progress, and make payments.
- **Technician:** Can manage repair services and assigned booking requests.
- **Admin:** Can manage users, services, bookings, and platform transactions.

Protected endpoints require a valid JWT access token.

Include the access token in the request header:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

The backend verifies JWT signatures using JOSE and the Better Auth JWKS endpoint. Role-based middleware controls access to protected operations.

### Role-Based Middleware

The backend applies authorization checks based on user roles:

- `verifyToken` – Verifies the user's authentication token.
- `verifyCustomer` – Restricts access to customer-specific operations.
- `verifyTechnician` – Restricts access to technician operations.
- `verifyAdmin` – Restricts access to administrative operations.

Unauthorized requests return appropriate HTTP status codes.

## Service Search and Filtering

The services API supports server-side search, filtering, and sorting.

Available functionality includes:

- Search by service title.
- Search by service category.
- Filter by category.
- Filter by service mode.
- Sort by price in ascending order.
- Sort by price in descending order.
- Sort by newest services.

## Booking Workflow

FixMate enforces booking status transitions on the backend.

```text
requested
    |
    +------> accepted
    |            |
    |            v
    |        in-progress
    |            |
    |            v
    |        completed
    |
    +------> rejected
```

Customers can cancel eligible requested bookings.

Technicians can review booking requests, accept or reject them, update repair progress, and complete repair jobs with a final amount.

The backend validates booking ownership, user roles, and permitted status transitions.

## Payment Integration

FixMate integrates Stripe Checkout in test mode.

Customers can pay for a repair only after the booking has been completed and the final repair amount has been set.

The backend handles:

- Stripe Checkout Session creation.
- Server-side payment amount validation.
- Payment verification.
- Stripe webhook event handling.
- Payment record creation in MongoDB.
- Booking payment status updates.
- Prevention of duplicate payment processing where supported by the implementation.

Payment amounts are determined from the backend booking record rather than trusting an amount supplied by the frontend.

### Stripe Testing

Use Stripe test-mode credentials for development and testing.

Never expose Stripe secret keys in frontend code or commit them to the repository.

## Project Structure

```text
ass9-server/
├── scripts/
├── src/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   ├── utils/
│   ├── app.js
│   └── index.js
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Error Handling

The backend uses centralized error handling to return consistent API responses.

Common HTTP status codes include:

| Status Code | Description |
|---|---|
| `200` | Successful request |
| `201` | Resource created |
| `400` | Invalid request |
| `401` | Authentication required |
| `403` | Insufficient permissions |
| `404` | Resource not found |
| `409` | Conflict |
| `500` | Internal server error |

## Security

The backend includes security measures such as:

- JWT signature verification.
- Role-based authorization.
- Protected API routes.
- User-specific data access.
- Booking ownership validation.
- Server-side payment amount verification.
- Stripe webhook signature verification.
- Environment-based secret management.

## Testing

Run the automated test suite using:

```bash
npm test
```

The project uses Node.js's built-in test runner.

## License

This project was developed as an academic full-stack web development assignment.