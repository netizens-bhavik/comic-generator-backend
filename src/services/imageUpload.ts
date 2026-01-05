import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to uploads folder (relative to backend root)
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

/**
 * Ensure uploads directory exists
 */
export const ensureUploadsDir = async (): Promise<void> => {
  try {
    await fs.access(UPLOADS_DIR);
  } catch {
    // Directory doesn't exist, create it
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
};

/**
 * Convert base64 string to buffer
 */
const base64ToBuffer = (base64String: string): Buffer => {
  // Remove data URL prefix if present
  const base64Data = base64String.includes(',') 
    ? base64String.split(',')[1] 
    : base64String;
  
  return Buffer.from(base64Data, 'base64');
};

/**
 * Detect MIME type from base64 string
 */
const detectMimeType = (base64String: string): string => {
  if (base64String.startsWith('data:image/jpeg') || base64String.startsWith('data:image/jpg')) {
    return 'image/jpeg';
  } else if (base64String.startsWith('data:image/png')) {
    return 'image/png';
  } else if (base64String.startsWith('data:image/webp')) {
    return 'image/webp';
  }
  return 'image/png'; // Default
};

/**
 * Get file extension from MIME type
 */
const getExtensionFromMimeType = (mimeType: string): string => {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return mimeToExt[mimeType] || 'png';
};

/**
 * Upload an image to the local uploads folder
 * @param imageData - Base64 string
 * @param fileName - Optional custom filename (without extension)
 * @returns Relative path to the uploaded image (e.g., "images/original-abc123-1234567890.png")
 */
export const uploadImage = async (
  imageData: string,
  fileName?: string
): Promise<string> => {
  await ensureUploadsDir();

  // Generate unique filename if not provided
  const uniqueId = randomUUID().split('-')[0];
  const timestamp = Date.now();
  const mimeType = detectMimeType(imageData);
  const extension = getExtensionFromMimeType(mimeType);
  
  const finalFileName = fileName 
    ? `${fileName}-${uniqueId}-${timestamp}.${extension}`
    : `image-${uniqueId}-${timestamp}.${extension}`;

  // Store in images subfolder
  const imagesDir = path.join(UPLOADS_DIR, 'images');
  await fs.mkdir(imagesDir, { recursive: true });
  
  const filePath = path.join(imagesDir, finalFileName);
  const buffer = base64ToBuffer(imageData);

  // Write file
  await fs.writeFile(filePath, buffer);

  // Return relative path for URL (e.g., "images/filename.png")
  return `images/${finalFileName}`;
};

/**
 * Delete an image from the uploads folder
 * @param imagePath - Relative path (e.g., "images/filename.png")
 */
export const deleteImage = async (imagePath: string): Promise<void> => {
  try {
    const fullPath = path.join(UPLOADS_DIR, imagePath);
    await fs.unlink(fullPath);
  } catch (error) {
    console.error('Error deleting image:', error);
    // Don't throw - deletion is best effort
  }
};

/**
 * Check if a string is a base64 image
 */
export const isBase64Image = (str: string): boolean => {
  return str.startsWith('data:image/') || (str.length > 100 && !str.startsWith('http'));
};

/**
 * Check if a string is a URL/path
 */
export const isImagePath = (str: string): boolean => {
  return str.startsWith('http') || str.startsWith('/') || str.startsWith('images/');
};

/**
 * Convert a relative image path to a full URL with backend domain
 * @param imagePath - Relative path (e.g., "images/filename.png" or "/uploads/images/filename.png")
 * @returns Full URL (e.g., "https://api.mycomic.online/uploads/images/filename.png")
 */
export const getImageUrl = (imagePath: string): string => {
  // If it's already a full URL, return as is
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  
  // Get backend URL from environment variable
  const backendUrl = process.env.BACKEND_URL || process.env.API_URL || 'https://api.mycomic.online';
  
  // Remove trailing slash from backend URL
  const baseUrl = backendUrl.replace(/\/$/, '');
  
  // If path starts with /uploads, use it directly
  if (imagePath.startsWith('/uploads/')) {
    return `${baseUrl}${imagePath}`;
  }
  
  // If path starts with /uploads (without trailing), add it
  if (imagePath.startsWith('/uploads')) {
    return `${baseUrl}${imagePath}`;
  }
  
  // If path is just "images/...", add /uploads prefix
  if (imagePath.startsWith('images/')) {
    return `${baseUrl}/uploads/${imagePath}`;
  }
  
  // Default: assume it's a relative path that needs /uploads prefix
  return `${baseUrl}/uploads/${imagePath}`;
};

