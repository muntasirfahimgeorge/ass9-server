# FixMate API

Backend REST API for FixMate, a Smart Device and Home Appliance Repair Service Platform.

Built with Node.js, Express.js, MongoDB, BetterAuth JWT authentication, and Stripe Checkout.

## Features

- Role-based authentication and authorization.
- Customer, technician, and admin access control.
- Service creation, management, approval, and availability.
- Server-side service search, filtering, and sorting.
- Repair booking and booking status management.
- Stripe Checkout test-mode payment processing.
- Payment verification and webhook handling.
- Admin dashboard APIs for platform management.
- MongoDB database integration.

## Technology Stack

- Node.js
- Express.js
- MongoDB
- BetterAuth JWT / JWKS
- Stripe
- JavaScript (ES Modules)

## Requirements

- Node.js
- npm
- MongoDB database
- FixMate frontend application
- Stripe account for test payments

## Installation

Clone the repository:

```bash
git clone https://github.com/muntasirfahimgeorge/ass9-server.git
```

Navigate to the project:

```bash
cd ass9-server
```

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Configure the environment variables in `.env`.

## Environment Variables

| Variable | Description |
|---|---|
| PORT | Backend server port. Default: 5000 |
| DB_URI | MongoDB connection string |
| CLIENT_URL | Frontend application URL |
| BETTER_AUTH_URL | BetterAuth frontend base URL |
| STRIPE_SECRET_KEY | Stripe secret key |
| STRIPE_WEBHOOK_SECRET | Stripe webhook signing secret |

Never commit the `.env` file or expose secret keys.

## Run the Server

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

By default, the API runs at:

```text
http://localhost:5000
```

## Health Check

Endpoint:

```http
GET /api/health
```

This endpoint checks whether the backend is running.

## API Route Groups

All application API routes are mounted under `/api`.

| Route Group | Description |
|---|---|
| `/api/health` | Backend health check |
| `/api/users` | User profile management |
| `/api/services` | Service listing and management |
| `/api/bookings` | Repair booking management |
| `/api/payments` | Stripe checkout and payment verification |
| `/api/admin` | Administrative management |

### Authentication

Protected endpoints require a valid JWT access token.

Include the token in the request header:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

The backend verifies JWT signatures using the BetterAuth JWKS endpoint and applies role-based authorization.

Supported roles:

- customer
- technician
- admin

### Service Search and Filtering

The services API supports server-side:

- Search by service title and category.
- Category filtering.
- Service mode filtering.
- Price ascending and descending sorting.
- Newest-first sorting.

### Booking Workflow

Booking status transitions are enforced by the backend:

```text
requested
    |
    +----> accepted
    |          |
    |          v
    |      in-progress
    |          |
    |          v
    |      completed
    |
    +----> rejected
```

Customers can cancel eligible requested bookings.

### Payment Workflow

FixMate uses Stripe Checkout in test mode.

Payment is permitted only for completed, unpaid bookings.

The backend:

- Calculates the payment amount from the booking record.
- Creates Stripe Checkout Sessions.
- Verifies completed payments with Stripe.
- Stores payment records in MongoDB.
- Updates booking payment status.
- Handles Stripe webhook events.

Payment methods are managed through Stripe Dashboard settings.

For testing, use Stripe test-mode credentials. Never use live payment credentials during local testing.

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
└── README.md
```

## Error Handling

The backend uses a centralized error-handling middleware and consistent JSON API responses.

Common HTTP status codes:

- `200` - Successful request
- `201` - Resource created
- `400` - Invalid request
- `401` - Authentication required
- `403` - Insufficient permissions
- `404` - Resource not found
- `409` - Conflict
- `500` - Internal server error

## Security

- JWT signature verification.
- Role-based route protection.
- User-specific data access.
- Server-side payment amount verification.
- Stripe webhook signature verification.
- Environment-based secret management.

## License

This project was developed as an academic full-stack web development assignment.
