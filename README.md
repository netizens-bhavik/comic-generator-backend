# Comic Generator Backend API

Node.js backend API for the Comic Generator application using Express, MySQL, and JWT authentication.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
npm run setup-env
```

Or manually copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
- **JWT_SECRET**: Generate a strong random string:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **API_KEY**: Add your Google Gemini API key from https://makersuite.google.com/app/apikey
- **Database credentials**: Update if different from defaults (currently set to valet/Admin@0056)

4. Run database migrations:
```bash
npm run migrate
```

This will:
- Create the database if it doesn't exist
- Run all migration files in order
- Verify tables were created successfully

Alternatively, you can run migrations manually:
```bash
mysql -u valet -pAdmin@0056 -e "CREATE DATABASE IF NOT EXISTS comic_generator;"
mysql -u valet -pAdmin@0056 comic_generator < database/migrations/001_create_users_table.sql
mysql -u valet -pAdmin@0056 comic_generator < database/migrations/002_create_comics_table.sql
```

6. Start the development server:
```bash
npm run dev
```

The server will run on `http://localhost:3001` by default.

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info

### Comics

- `GET /api/comics` - Get all comics (summary only)
- `GET /api/comics/:id` - Get single comic by ID
- `POST /api/comics` - Create new comic
- `POST /api/comics/generate` - Generate comic script and images
- `PUT /api/comics/:id` - Update comic
- `DELETE /api/comics/:id` - Delete comic

### Image Editor

- `POST /api/image-editor/edit` - Edit image with AI prompt

## Authentication

All endpoints except `/api/auth/*` require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

Tokens are obtained from the login/register endpoints and expire after 7 days by default.

