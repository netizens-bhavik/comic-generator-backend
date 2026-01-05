import { GoogleGenAI, Modality, Type } from "@google/genai";
import { 
  buildImagePromptWithConsistency,
  createCharacterDescription,
  CharacterDescription
} from "./characterConsistency";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

export interface ComicPanel {
  scene: string;
  narration: string;
  imageUrl?: string;
}

export interface ComicPanels {
  box1: ComicPanel;
  box2: ComicPanel;
  box3: ComicPanel;
  box4: ComicPanel;
  box5: ComicPanel;
}

export type ComicCategory = 'Adventure' | 'Fairy Tale' | 'Mythology' | 'Sci-Fi' | 'Superhero' | 'Fantasy';
export type SourceType = 'Predefined' | 'AI';

export const generateComicScript = async (
  category: ComicCategory,
  sourceType: SourceType,
  imageBase64: string,
  characterNames: string[]
): Promise<{ title: string; panels: ComicPanels }> => {
  const ai = getAiClient();

  const mainChar = characterNames[0] || "The Hero";
  const secondChar = characterNames[1] ? ` and ${characterNames[1]}` : "";
  const charsDescription = `${mainChar}${secondChar}`;

  const consistencyInstructions = `
  CRITICAL CHARACTER CONSISTENCY REQUIREMENTS (STRICT — MUST BE FOLLOWED):
  
  IDENTITY LOCK (NO VARIATION ALLOWED):
  - Once a character appears, their appearance is LOCKED for the entire comic.
  - Facial structure, face shape, skin tone, eye shape, nose, mouth, body type, height, and proportions MUST remain EXACTLY the same in ALL panels.
  - Clothing, colors, hairstyle, accessories, and footwear MUST be IDENTICAL in every panel.
  - NO changes, upgrades, damage, aging, or stylistic variation are allowed between panels.
  
  REFERENCE IMAGE USAGE (IDENTITY ONLY):
  - The main character (${mainChar}) MUST be based on the uploaded photo ONLY to extract identity (face and body shape).
  - The uploaded image MUST NEVER be rendered as a real photo or realistic drawing.
  - DO NOT copy photographic lighting, shadows, skin texture, pores, wrinkles, fabric texture, or realism from the image.
  - The character MUST ALWAYS be transformed into a CARTOON COMIC-BOOK VERSION.
  
  STRICT COMIC BOOK STYLE — NO EXCEPTIONS:
  - ALL images MUST be classic American comic book illustrations.
  - 2D hand-drawn cartoon style ONLY.
  - Thick black ink outlines around characters and objects.
  - Flat, solid colors with simple cel shading (no gradients).
  - Halftone dots for shadows and backgrounds.
  - Bold, vibrant colors suitable for children’s comic books.
  
  ABSOLUTELY FORBIDDEN (NEVER ALLOWED):
  - Real photos or photo-like images
  - Photorealistic or semi-realistic rendering
  - AI-art realism
  - Digital painting or painterly styles
  - 3D rendering, Pixar/Disney/DreamWorks styles
  - Anime, manga, or cinematic styles
  - Soft lighting, realistic shadows, depth-of-field, or blur
  
  STYLE IMMUTABILITY:
  - The comic style MUST NOT change, evolve, or drift between panels.
  - Every panel must look like it was drawn by the SAME comic artist on the SAME printed page.
  
  DESCRIPTION ENFORCEMENT:
  - Every scene description MUST restate key visual traits
    (example: “same red hoodie, same short black hair, same round face, same sneakers”).
  
  FINAL RULE:
  - If an image looks like a real photo or realistic illustration, it is WRONG and MUST be corrected into comic book style.
  `;
  

  const prompt = `
    You are the engine of a comic-story creation app for kids.
    Your task is to generate a complete 5-panel comic story that fits on a single page.
    
    IMPORTANT: Use very simple, basic English suitable for young children (ages 5-8).
    
    Inputs:
    1. Characters: ${charsDescription}. (The main character looks like the person in the uploaded photo).
    2. Selected Category: ${category}
    3. Story Source: ${sourceType === 'Predefined' ? 'Pick a classic trope from this category' : 'Create a fresh, original short story'}

    ${consistencyInstructions}

    Story Structure (5 panels that tell a complete story):
    - Box 1: Opening scene - Introduce the character and setting. Start the adventure.
    - Box 2: Rising action - Something interesting happens or a challenge appears.
    - Box 3: Development - The character faces the challenge or explores further.
    - Box 4: Climax - The most exciting moment or turning point.
    - Box 5: Resolution - A satisfying conclusion that wraps up the story nicely.
    
    CRITICAL: The story MUST conclude and feel complete in Box 5. Box 5 should provide a clear ending, resolution, or satisfying conclusion to the adventure.
    
    Output Constraints:
    - Title: A catchy, simple name for this story.
    - Box 1: Scene Description (visuals) & Narration (simple text). Include specific character appearance details. Opening scene. Describe scenes as they would appear in a comic book (cartoon style, not realistic).
    - Box 2: Scene Description (visuals) & Narration (simple text). Ensure characters look identical to Box 1. Rising action. Describe in comic book style.
    - Box 3: Scene Description (visuals) & Narration (simple text). Maintain exact same character appearances. Development. Describe in comic book style.
    - Box 4: Scene Description (visuals) & Narration (simple text). Maintain exact same character appearances. Climax/turning point. Describe in comic book style.
    - Box 5: Scene Description (visuals) & Narration (simple text). Maintain exact same character appearances. CONCLUSION - must wrap up the story with a satisfying ending. Describe in comic book style.
    - Tone: Fun, exciting, and safe.
    - Safety: No violent, scary, or harmful content.
    - Style Note: All scene descriptions should be written with comic book illustration style in mind (cartoon, vibrant colors, bold outlines).
  `;

  // Using Gemini 2.5 Flash for text logic
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          // We pass the image to the text model so it "sees" the character for context if needed
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64.split(',')[1], 
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "A creative title for the comic story.",
          },
          box1: {
            type: Type.OBJECT,
            properties: {
              scene: { type: Type.STRING, description: "Visual description of the scene." },
              narration: { type: Type.STRING, description: "The caption text or dialogue." },
            },
            required: ["scene", "narration"],
          },
          box2: {
            type: Type.OBJECT,
            properties: {
              scene: { type: Type.STRING, description: "Visual description of the scene." },
              narration: { type: Type.STRING, description: "The caption text or dialogue." },
            },
            required: ["scene", "narration"],
          },
          box3: {
            type: Type.OBJECT,
            properties: {
              scene: { type: Type.STRING, description: "Visual description of the scene." },
              narration: { type: Type.STRING, description: "The caption text or dialogue." },
            },
            required: ["scene", "narration"],
          },
          box4: {
            type: Type.OBJECT,
            properties: {
              scene: { type: Type.STRING, description: "Visual description of the scene." },
              narration: { type: Type.STRING, description: "The caption text or dialogue." },
            },
            required: ["scene", "narration"],
          },
          box5: {
            type: Type.OBJECT,
            properties: {
              scene: { type: Type.STRING, description: "Visual description of the scene. This is the CONCLUSION." },
              narration: { type: Type.STRING, description: "The caption text or dialogue that concludes the story." },
            },
            required: ["scene", "narration"],
          },
        },
        required: ["title", "box1", "box2", "box3", "box4", "box5"],
      },
    },
  });

  const jsonText = response.text || "{}";
  const result = JSON.parse(jsonText);
  return {
    title: result.title || "Untitled Adventure",
    panels: {
      box1: result.box1,
      box2: result.box2,
      box3: result.box3,
      box4: result.box4,
      box5: result.box5
    }
  };
};

export const generatePanelImage = async (
  originalImageBase64: string,
  sceneDescription: string,
  characterNames: string[] = [],
  characterDescriptions: CharacterDescription[] = [],
  panelIndex?: number // 1-5 to indicate which panel this is
): Promise<string> => {
  const ai = getAiClient();

  // Use character descriptions if provided, otherwise create them from names
  const finalCharacterDescriptions = characterDescriptions.length > 0
    ? characterDescriptions
    : characterNames.map(name => createCharacterDescription(name, originalImageBase64));

  // Determine aspect ratio based on panel position
  // Panels 1-4 are side-by-side (roughly square/landscape), Panel 5 is full width (wider landscape)
  const aspectRatio = panelIndex === 5 
    ? "16:9 landscape format (wider than tall)" 
    : "4:3 or square format (slightly wider than tall)";
  
  const panelLayout = panelIndex === 5
    ? "full-width panel at the bottom of the page"
    : "side-by-side panel in the top or middle row";

  // Negative style guard to prevent unwanted styles
  const negativeStyleGuard = `
NEGATIVE PROMPT:
photo, photograph, photorealistic, realistic, ultra-detailed,
cinematic lighting, soft lighting, studio lighting,
3d render, blender, unreal engine,
digital painting, concept art,
anime, manga, chibi,
pixar, disney, dreamworks,
ai generated, midjourney style,
smooth shading, gradients, realism
`;

  // Build enhanced prompt using character consistency utilities
  const consistencyPrompt = buildImagePromptWithConsistency(
    sceneDescription,
    characterNames,
    finalCharacterDescriptions,
    "the provided reference image"
  );

  // Combine negative guard with consistency prompt
  const basePrompt = `
${negativeStyleGuard}
${consistencyPrompt}
`;

  // Final prompt with absolute style contract
  const prompt = `
${basePrompt}

==============================
ABSOLUTE STYLE CONTRACT (MUST FOLLOW)
==============================

This image MUST look like a CLASSIC AMERICAN COMIC BOOK PANEL.

STYLE REQUIREMENTS (NON-NEGOTIABLE):
- Hand-drawn comic book illustration
- Thick black ink outlines around ALL characters and objects
- Flat, solid colors (NO gradients, NO soft shading)
- Simple cel shading only (1–2 shadow tones max)
- Halftone dot texture for shadows and backgrounds
- Bold, high-contrast color palette
- Slightly exaggerated cartoon proportions
- 2D illustration ONLY

REFERENCE STYLE:
- Classic Marvel / DC comic books (Silver–Bronze Age)
- Saturday morning superhero comics
- Children's comic books from printed pages

STRICTLY FORBIDDEN (DO NOT USE):
- Photorealism
- Semi-realistic illustration
- Digital painting
- AI-art look
- Pixar, Disney, DreamWorks style
- Anime or manga style
- 3D rendering
- Soft lighting
- Airbrushed shading
- Painterly textures
- Realistic skin, fabric, or lighting
- Cinematic lighting
- Depth-of-field blur

IMPORTANT CHARACTER RULES:
- The uploaded photo is ONLY for facial identity and body shape
- DO NOT copy lighting, skin texture, or realism from the photo
- Convert the character into a CARTOON COMIC VERSION
- Same clothes, same colors, same hairstyle, same face in EVERY panel

LAYOUT & COMPOSITION:
- ${panelLayout}
- ${aspectRatio}
- Clean framing like a printed comic panel
- No cropped faces or limbs
- Center the main action clearly

FINAL CHECK BEFORE OUTPUT:
Ask yourself: "Would this image look correct printed in a children's comic book?"
If not, FIX IT.

OUTPUT ONLY THE IMAGE. NO TEXT.
`;

  try {
    const base64Data = originalImageBase64.split(',')[1];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg', 
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts && parts.length > 0) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    
    console.warn("No image data returned for panel, using original.");
    return originalImageBase64; // Fallback
  } catch (error) {
    console.error("Error generating panel image, falling back to original:", error);
    // Return the original image if generation fails to prevent app crash/hang
    return originalImageBase64; 
  }
};

export const editImageWithGemini = async (
  imageBase64: string,
  prompt: string
): Promise<string> => {
  const ai = getAiClient();

  try {
    // Clean base64 string
    const base64Data = imageBase64.split(',')[1];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg', // Assuming JPEG for simplicity from canvas/input
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    // Parse the response to find the image
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts && parts.length > 0) {
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
    }
    
    throw new Error("No image data returned from Gemini.");

  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
};

