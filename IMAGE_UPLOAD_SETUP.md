# Image Upload Setup

This application saves images to a local `uploads` folder on the server instead of storing base64 data in the database.

## Directory Structure

```
backend/
  └── uploads/
      └── images/
          ├── original-{uniqueId}-{timestamp}.png
          ├── panel-box1-{uniqueId}-{timestamp}.png
          ├── panel-box2-{uniqueId}-{timestamp}.png
          ├── panel-box3-{uniqueId}-{timestamp}.png
          ├── panel-box4-{uniqueId}-{timestamp}.png
          └── panel-box5-{uniqueId}-{timestamp}.png
```

## How It Works

1. **Image Upload**: When a comic is created, base64 images are uploaded to the server via `/api/images/upload`
2. **File Storage**: Images are saved to `backend/uploads/images/` folder
3. **Database**: Only the image path/URL is stored in the database (e.g., `/uploads/images/original-abc123-1234567890.png`)
4. **Serving**: Images are served statically via Express at `/uploads/*`

## API Endpoints

### POST `/api/images/upload`
Upload a single base64 image.

**Request:**
```json
{
  "imageBase64": "data:image/png;base64,...",
  "fileName": "original" // optional
}
```

**Response:**
```json
{
  "imagePath": "images/original-abc123-1234567890.png",
  "imageUrl": "/uploads/images/original-abc123-1234567890.png"
}
```

### POST `/api/images/upload-multiple`
Upload multiple base64 images.

**Request:**
```json
{
  "images": [
    { "imageBase64": "...", "fileName": "original" },
    { "imageBase64": "...", "fileName": "panel-box1" }
  ]
}
```

### DELETE `/api/images/:path`
Delete an image by path.

## Benefits

1. **Smaller Database**: No large base64 strings stored in database
2. **Better Performance**: Faster queries and smaller payloads
3. **Efficient Storage**: Images stored as files, not in database
4. **CDN Ready**: Can easily move to CDN or cloud storage later
5. **Backward Compatible**: Still supports base64 images for legacy data

## Notes

- The `uploads/` folder is created automatically on first upload
- Images are organized in an `images/` subfolder
- Filenames include unique IDs to prevent conflicts
- The folder is excluded from git (see `.gitignore`)

