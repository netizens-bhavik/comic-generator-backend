import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import pool from '../config/database.js';
import { generateComicScript, generatePanelImage } from '../services/gemini.js';
import { getImageUrl } from '../services/imageUpload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all comics (summary only - no images)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, title, category, created_at 
       FROM comics 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [req.userId]
    ) as any[];

    const comics = rows.map((row: any) => ({
      id: row.id.toString(),
      title: row.title,
      category: row.category,
      createdAt: new Date(row.created_at).getTime(),
    }));

    res.json(comics);
  } catch (error: any) {
    console.error('Error fetching comics:', error);
    res.status(500).json({ error: 'Failed to fetch comics' });
  }
});

// Get single comic by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    console.log('Fetching comic:', { id, userId: req.userId });

    // Try both string and number ID formats
    const [rows] = await pool.execute(
      'SELECT * FROM comics WHERE (id = ? OR id = ?) AND user_id = ?',
      [id, parseInt(id, 10), req.userId]
    ) as any[];

    if (rows.length === 0) {
      console.log('Comic not found:', { id, userId: req.userId });
      return res.status(404).json({ error: 'Comic not found' });
    }

    const comic = rows[0];
    
    // Parse JSON fields safely
    let characterNames: string[] = [];
    let panels: any = {};
    
    try {
      characterNames = typeof comic.character_names === 'string' 
        ? JSON.parse(comic.character_names) 
        : comic.character_names;
    } catch (e) {
      console.error('Error parsing character_names:', e);
      characterNames = [];
    }
    
    try {
      panels = typeof comic.panels === 'string' 
        ? JSON.parse(comic.panels) 
        : comic.panels;
    } catch (e) {
      console.error('Error parsing panels:', e);
      panels = {};
    }

    // Convert image paths to full URLs with backend domain
    const convertImagePath = (path: string): string => {
      if (!path || path.startsWith('http') || path.startsWith('data:image/')) {
        return path;
      }
      return getImageUrl(path);
    };

    // Convert originalImage to full URL
    const originalImageUrl = convertImagePath(comic.original_image);

    // Convert panel imageUrls to full URLs
    const panelsWithFullUrls = {
      box1: panels.box1 ? { ...panels.box1, imageUrl: panels.box1.imageUrl ? convertImagePath(panels.box1.imageUrl) : undefined } : panels.box1,
      box2: panels.box2 ? { ...panels.box2, imageUrl: panels.box2.imageUrl ? convertImagePath(panels.box2.imageUrl) : undefined } : panels.box2,
      box3: panels.box3 ? { ...panels.box3, imageUrl: panels.box3.imageUrl ? convertImagePath(panels.box3.imageUrl) : undefined } : panels.box3,
      box4: panels.box4 ? { ...panels.box4, imageUrl: panels.box4.imageUrl ? convertImagePath(panels.box4.imageUrl) : undefined } : panels.box4,
      box5: panels.box5 ? { ...panels.box5, imageUrl: panels.box5.imageUrl ? convertImagePath(panels.box5.imageUrl) : undefined } : panels.box5,
    };

    const response = {
      id: comic.id.toString(),
      title: comic.title,
      createdAt: new Date(comic.created_at).getTime(),
      category: comic.category,
      sourceType: comic.source_type,
      characterNames,
      originalImage: originalImageUrl,
      panels: panelsWithFullUrls,
    };

    console.log('Comic fetched successfully:', { id: response.id, title: response.title });
    res.json(response);
  } catch (error: any) {
    console.error('Error fetching comic:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      id: req.params.id,
      userId: req.userId,
    });
    res.status(500).json({ 
      error: 'Failed to fetch comic',
      details: error.message 
    });
  }
});

// Create new comic
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      category,
      sourceType,
      characterNames,
      originalImage,
      panels,
    } = req.body;

    if (!title || !category || !sourceType || !characterNames || !originalImage || !panels) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [result] = await pool.execute(
      `INSERT INTO comics (user_id, title, category, source_type, character_names, original_image, panels)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userId,
        title,
        category,
        sourceType,
        JSON.stringify(characterNames),
        originalImage,
        JSON.stringify(panels),
      ]
    ) as any[];

    const comicId = result.insertId;

    console.log('Comic created:', { id: comicId, title });

    res.status(201).json({
      id: comicId.toString(),
      title,
      category,
      sourceType,
      characterNames,
      originalImage,
      panels,
    });
  } catch (error: any) {
    console.error('Error creating comic:', error);
    res.status(500).json({ error: 'Failed to create comic' });
  }
});

// Generate comic script and images
router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const { category, sourceType, imageBase64, characterNames } = req.body;

    if (!category || !sourceType || !imageBase64 || !characterNames || !Array.isArray(characterNames)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (characterNames.length === 0 || !characterNames[0]) {
      return res.status(400).json({ error: 'At least one character name is required' });
    }

    // Generate script
    const { title, panels } = await generateComicScript(
      category,
      sourceType,
      imageBase64,
      characterNames
    );

    // Generate images for all panels in parallel
    const imagePromises = [
      generatePanelImage(imageBase64, panels.box1.scene, characterNames, [], 1),
      generatePanelImage(imageBase64, panels.box2.scene, characterNames, [], 2),
      generatePanelImage(imageBase64, panels.box3.scene, characterNames, [], 3),
      generatePanelImage(imageBase64, panels.box4.scene, characterNames, [], 4),
      generatePanelImage(imageBase64, panels.box5.scene, characterNames, [], 5),
    ];

    const [img1, img2, img3, img4, img5] = await Promise.all(imagePromises);

    // Add image URLs to panels
    const panelsWithImages = {
      box1: { ...panels.box1, imageUrl: img1 },
      box2: { ...panels.box2, imageUrl: img2 },
      box3: { ...panels.box3, imageUrl: img3 },
      box4: { ...panels.box4, imageUrl: img4 },
      box5: { ...panels.box5, imageUrl: img5 },
    };

    res.json({
      title,
      panels: panelsWithImages,
    });
  } catch (error: any) {
    console.error('Error generating comic:', error);
    res.status(500).json({ error: error.message || 'Failed to generate comic' });
  }
});

// Update comic
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, category, sourceType, characterNames, originalImage, panels } = req.body;

    // Check if comic exists and belongs to user
    const [existing] = await pool.execute(
      'SELECT id FROM comics WHERE id = ? AND user_id = ?',
      [id, req.userId]
    ) as any[];

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (sourceType !== undefined) {
      updates.push('source_type = ?');
      values.push(sourceType);
    }
    if (characterNames !== undefined) {
      updates.push('character_names = ?');
      values.push(JSON.stringify(characterNames));
    }
    if (originalImage !== undefined) {
      updates.push('original_image = ?');
      values.push(originalImage);
    }
    if (panels !== undefined) {
      updates.push('panels = ?');
      values.push(JSON.stringify(panels));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(id, req.userId);

    await pool.execute(
      `UPDATE comics SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    // Fetch updated comic
    const [rows] = await pool.execute(
      'SELECT * FROM comics WHERE id = ? AND user_id = ?',
      [id, req.userId]
    ) as any[];

    const comic = rows[0];
    
    // Parse JSON fields
    let characterNames: string[] = [];
    let panels: any = {};
    
    try {
      characterNames = typeof comic.character_names === 'string' 
        ? JSON.parse(comic.character_names) 
        : comic.character_names;
    } catch (e) {
      characterNames = [];
    }
    
    try {
      panels = typeof comic.panels === 'string' 
        ? JSON.parse(comic.panels) 
        : comic.panels;
    } catch (e) {
      panels = {};
    }

    // Convert image paths to full URLs with backend domain
    const convertImagePath = (path: string): string => {
      if (!path || path.startsWith('http') || path.startsWith('data:image/')) {
        return path;
      }
      return getImageUrl(path);
    };

    // Convert originalImage to full URL
    const originalImageUrl = convertImagePath(comic.original_image);

    // Convert panel imageUrls to full URLs
    const panelsWithFullUrls = {
      box1: panels.box1 ? { ...panels.box1, imageUrl: panels.box1.imageUrl ? convertImagePath(panels.box1.imageUrl) : undefined } : panels.box1,
      box2: panels.box2 ? { ...panels.box2, imageUrl: panels.box2.imageUrl ? convertImagePath(panels.box2.imageUrl) : undefined } : panels.box2,
      box3: panels.box3 ? { ...panels.box3, imageUrl: panels.box3.imageUrl ? convertImagePath(panels.box3.imageUrl) : undefined } : panels.box3,
      box4: panels.box4 ? { ...panels.box4, imageUrl: panels.box4.imageUrl ? convertImagePath(panels.box4.imageUrl) : undefined } : panels.box4,
      box5: panels.box5 ? { ...panels.box5, imageUrl: panels.box5.imageUrl ? convertImagePath(panels.box5.imageUrl) : undefined } : panels.box5,
    };

    res.json({
      id: comic.id.toString(),
      title: comic.title,
      createdAt: new Date(comic.created_at).getTime(),
      category: comic.category,
      sourceType: comic.source_type,
      characterNames,
      originalImage: originalImageUrl,
      panels: panelsWithFullUrls,
    });
  } catch (error: any) {
    console.error('Error updating comic:', error);
    res.status(500).json({ error: 'Failed to update comic' });
  }
});

// Delete comic
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM comics WHERE id = ? AND user_id = ?',
      [id, req.userId]
    ) as any[];

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }

    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting comic:', error);
    res.status(500).json({ error: 'Failed to delete comic' });
  }
});

export default router;

