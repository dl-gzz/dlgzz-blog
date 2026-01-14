# OutfitAI - AI Virtual Try-On Application

An innovative AI-powered virtual try-on application that allows users to try on clothes virtually using advanced AI technology. Built with MkSaaS, this application provides a seamless experience for users to see how different outfits look on them without physically trying them on.

## Features

- 🤖 **AI Virtual Try-On**: Advanced AI technology for realistic clothing simulation
- 👕 **Outfit Management**: Upload and manage different clothing items
- 💳 **Subscription Plans**: Pro monthly, yearly, and lifetime subscription options
- 🔐 **Secure Authentication**: Google OAuth integration with Better Auth
- 💾 **Cloud Storage**: Aliyun OSS integration for secure file storage
- 🎨 **Modern UI**: Beautiful and responsive user interface
- 📱 **Mobile Friendly**: Optimized for all devices

## Quick Start

### Prerequisites

- Node.js 18+ 
- pnpm (recommended package manager)
- PostgreSQL database
- Aliyun OSS account
- Stripe account for payments
- Google OAuth credentials

### Installation

1. Clone the repository:
```bash
git clone <your-repository-url>
cd outfitai
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables (see Environment Variables section below)

4. Set up the database:
```bash
pnpm db:migrate
```

5. Start the development server:
```bash
pnpm dev
```

## Environment Variables

Copy `env.example` to `.env` and fill in the required environment variables:

### Required Environment Variables

```bash
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/outfitai"

# Authentication
BETTER_AUTH_SECRET="your-32-character-secret-key"

# Google OAuth (required for user authentication)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Stripe Payment Integration
STRIPE_SECRET_KEY="sk_test_your-stripe-secret-key"
STRIPE_WEBHOOK_SECRET="whsec_your-webhook-secret"

# Subscription Plans
NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY="price_your-monthly-price-id"
NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY="price_your-yearly-price-id"

# Aliyun AI Service (DashScope)
DASHSCOPE_API_KEY="your-dashscope-api-key"

# Aliyun OSS Storage
MY_OSS_ACCESS_KEY_ID="your-oss-access-key-id"
MY_OSS_ACCESS_KEY_SECRET="your-oss-access-key-secret"
```

### Setting Up Required Services

#### 1. Database Setup
- Create a PostgreSQL database
- Update `DATABASE_URL` with your database connection string

#### 2. Google OAuth Setup
- Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- Create a new OAuth 2.0 Client ID
- Add your domain to authorized origins
- Copy the Client ID and Secret to your environment variables

#### 3. Stripe Payment Setup
- Create a [Stripe account](https://dashboard.stripe.com)
- Get your API keys from the dashboard
- Create subscription products and copy the price IDs
- Set up webhooks for payment processing

#### 4. Aliyun Services Setup
- **DashScope API**: Get your API key from [Aliyun DashScope Console](https://bailian.console.aliyun.com/)
- **OSS Storage**: 
  - Create an OSS bucket named `outfittest` in the `cn-beijing` region
  - Get your Access Key ID and Secret from [RAM Console](https://ram.console.aliyun.com/users)

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run linter
- `pnpm format` - Format code
- `pnpm db:generate` - Generate database migrations
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open database studio

## Project Structure

```
outfitai/
├── src/
│   ├── app/                 # Next.js app router
│   ├── components/          # React components
│   ├── lib/                 # Utility libraries
│   ├── hooks/               # Custom React hooks
│   ├── db/                  # Database schema and migrations
│   └── styles/              # Global styles
├── public/                  # Static assets
└── docs/                    # Documentation
```

