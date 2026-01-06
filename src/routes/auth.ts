import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import pool from '../config/database.js';

const router = express.Router();

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    ) as any[];

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const [result] = await pool.execute(
      'INSERT INTO users (email, password_hash, name, phone) VALUES (?, ?, ?, ?)',
      [email, passwordHash, name, phone || null]
    ) as any[];

    const userId = result.insertId;

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const expiresIn: StringValue | number = (process.env.JWT_EXPIRES_IN || '7d') as StringValue;
    const signOptions: SignOptions = {
      expiresIn
    };

    const token = jwt.sign(
      { userId: userId.toString(), email },
      jwtSecret,
      signOptions
    );

    res.status(201).json({
      token,
      user: {
        id: userId.toString(),
        email,
        name,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const [users] = await pool.execute(
      'SELECT id, email, password_hash, name FROM users WHERE email = ?',
      [email]
    ) as any[];

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const expiresIn: StringValue | number = (process.env.JWT_EXPIRES_IN || '7d') as StringValue;
    const signOptions: SignOptions = {
      expiresIn
    };

    const token = jwt.sign(
      { userId: user.id.toString(), email: user.email },
      jwtSecret,
      signOptions
    );

    res.json({
      token,
      user: {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const decoded = jwt.verify(token, jwtSecret) as { userId: string; email: string };

    const [users] = await pool.execute(
      'SELECT id, email, name, phone FROM users WHERE id = ?',
      [decoded.userId]
    ) as any[];

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    res.json({
      id: user.id.toString(),
      email: user.email,
      name: user.name,
      phone: user.phone,
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;

