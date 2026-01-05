import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { editImageWithGemini } from '../services/gemini.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Edit image with prompt
router.post('/edit', async (req: AuthRequest, res: Response) => {
  try {
    const { imageBase64, prompt } = req.body;

    if (!imageBase64 || !prompt) {
      return res.status(400).json({ error: 'Image and prompt are required' });
    }

    const editedImage = await editImageWithGemini(imageBase64, prompt);

    res.json({ imageUrl: editedImage });
  } catch (error: any) {
    console.error('Error editing image:', error);
    res.status(500).json({ error: error.message || 'Failed to edit image' });
  }
});

export default router;

