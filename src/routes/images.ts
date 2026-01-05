import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { uploadImage, deleteImage, isBase64Image } from '../services/imageUpload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * POST /api/images/upload
 * Upload a base64 image to the server
 * Body: { imageBase64: string, fileName?: string }
 * Returns: { imagePath: string, imageUrl: string }
 */
router.post('/upload', async (req: AuthRequest, res: Response) => {
  try {
    const { imageBase64, fileName } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    if (!isBase64Image(imageBase64)) {
      return res.status(400).json({ error: 'Invalid base64 image format' });
    }

    // Upload image
    const imagePath = await uploadImage(imageBase64, fileName);
    
    // Return path and full URL
    const imageUrl = `/uploads/${imagePath}`;

    res.json({
      imagePath,
      imageUrl,
    });
  } catch (error: any) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

/**
 * POST /api/images/upload-multiple
 * Upload multiple base64 images
 * Body: { images: Array<{ imageBase64: string, fileName?: string }> }
 * Returns: Array<{ imagePath: string, imageUrl: string }>
 */
router.post('/upload-multiple', async (req: AuthRequest, res: Response) => {
  try {
    const { images } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'images array is required' });
    }

    const uploadPromises = images.map(async (img: { imageBase64: string; fileName?: string }) => {
      if (!isBase64Image(img.imageBase64)) {
        throw new Error('Invalid base64 image format');
      }
      const imagePath = await uploadImage(img.imageBase64, img.fileName);
      return {
        imagePath,
        imageUrl: `/uploads/${imagePath}`,
      };
    });

    const results = await Promise.all(uploadPromises);

    res.json(results);
  } catch (error: any) {
    console.error('Error uploading images:', error);
    res.status(500).json({ error: error.message || 'Failed to upload images' });
  }
});

/**
 * DELETE /api/images/:path
 * Delete an image (path should be URL encoded)
 */
router.delete('/:path(*)', async (req: AuthRequest, res: Response) => {
  try {
    const imagePath = decodeURIComponent(req.params.path);
    
    await deleteImage(imagePath);
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

export default router;

