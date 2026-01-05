import { GoogleGenAI, Modality, Type } from "@google/genai";
import { 
  buildImagePromptWithConsistency,
  createCharacterDescription,
  extractCharacterDescriptionsFromScript,
  CharacterDescription
} from "./characterConsistency";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

// --- Image Analysis ---

export interface FaceAnalysisResult {
    faceCount: number;
    characters: {
        gender: 'Boy' | 'Girl' | 'Man' | 'Woman';
        estimatedAge: number; // We still infer this for internal generation prompt
        position: 'Left' | 'Right' | 'Center' | 'Single';
    }[];
}

export const analyzeImageFaces = async (imageBase64: string): Promise<FaceAnalysisResult> => {
    const ai = getAiClient();
    const base64Data = imageBase64.split(',')[1];

    const prompt = `
      Analyze this image and identify the human faces.
      Return a JSON object with:
      1. faceCount: Total number of distinct faces.
      2. characters: Array of objects for each face found (max 2), containing:
         - gender: 'Boy', 'Girl', 'Man', or 'Woman'.
         - estimatedAge: Integer (guess the age).
         - position: Where they are in the image ('Left', 'Right', 'Center').

      If more than 2 faces, just return the 2 most prominent ones.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        faceCount: { type: Type.INTEGER },
                        characters: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    gender: { type: Type.STRING, enum: ['Boy', 'Girl', 'Man', 'Woman'] },
                                    estimatedAge: { type: Type.INTEGER },
                                    position: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("No analysis returned");
        return JSON.parse(text) as FaceAnalysisResult;

    } catch (e) {
        console.error("Face analysis failed", e);
        // Fallback default
        return {
            faceCount: 1,
            characters: [{ gender: 'Boy', estimatedAge: 10, position: 'Center' }]
        };
    }
};

// --- Character Avatar Generation ---

export const generateCharacterVariations = async (
  imageBase64: string,
  gender: string
): Promise<string[]> => {
  const ai = getAiClient();
  const base64Data = imageBase64.split(',')[1];

  // We will generate 4 variations in parallel
  const prompt = `
  Generate a high-quality portrait of a ${gender} in a CLASSIC AMERICAN COMIC BOOK style.

  CRITICAL INSTRUCTION: EXACT CARTOON FACE REPLICA
  - The face in the output image MUST BE AN EXACT CARTOON REPLICA of the face in the input image.
  - TRANSFORM the facial features into a simplified, iconic CARTOON representation while maintaining recognition.
  - Keep the exact eye shape, nose shape, mouth shape, jawline, and ear shape, but RENDERED WITH SIMPLIFIED, THICK LINES AND FLAT SHAPES.
  - Keep the exact hair style and hair color, but RENDERED AS A CARTOON.
  - ONLY change the art style to "CLASSIC AMERICAN COMIC BOOK" (bold lines, COMPLETELY FLAT colors, simple cel shading), do NOT change the facial structure into realism.
  - The background should be a simple solid, flat color or a very simple, flat gradient.
  - Close-up shot (head and shoulders, or chest up).
  
  STYLE REQUIREMENTS (NON-NEGOTIABLE):
  - CLASSIC AMERICAN COMIC BOOK illustration style, HIGHLY CARTOONIZED.
  - EXTREMELY THICK black ink outlines around ALL features, hair, and edges.
  - COMPLETELY FLAT, VIBRANT, SOLID COLORS (ABSOLUTELY NO gradients, NO soft shading, NO color blending).
  - VERY SIMPLE cel shading ONLY (1–2 harsh shadow tones max, applied as solid blocks of color).
  - Hand-drawn, graphic, bold cartoon appearance.
  - STRICTLY 2D illustration ONLY.
  
  STRICTLY FORBIDDEN (DO NOT USE):
  - Photorealism, realistic rendering, hyperrealism, semi-realism, fine art.
  - 3D appearance, CGI, rendered looks.
  - Digital painting style, soft brush strokes, painterly effects.
  - Subtle lighting, realistic shadows, atmospheric effects, depth-of-field.
  - Skin texture, hair texture, pores, wrinkles, or any form of realistic detail.
  - Anime, Manga, Pixar, Disney, DreamWorks style (THESE ARE TOO DETAILED).
  - Any AI-art polish or smooth rendering.
`;

  const generateOne = async (): Promise<string | null> => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
            { text: prompt },
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
      return null;
    } catch (e) {
      console.error("Avatar generation failed", e);
      return null;
    }
  };

  // Run 4 generations in parallel
  const promises = [generateOne(), generateOne(), generateOne(), generateOne()];
  const results = await Promise.all(promises);

  // Filter out nulls
  return results.filter((img): img is string => img !== null);
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
  CRITICAL CHARACTER, STYLE, AND ILLUSTRATION REQUIREMENTS
  (ABSOLUTE — NO EXCEPTIONS — MUST BE FOLLOWED):
  
  PURE CARTOON ILLUSTRATION MODE (NO REALISM WHATSOEVER):
  - ALL images MUST be fully illustrated, artistic, and EXTREMELY CARTOON-LIKE.
  - The output MUST look SIMPLISTICALLY HAND-DRAWN, not rendered, not painted, and ABSOLUTELY NOT realistic.
  - The image MUST resemble VINTAGE PRINTED CHILDREN'S COMIC BOOK ART, NOT modern digital illustration.
  - EXTREMELY THICK, VISIBLE LINE ART MUST DOMINATE THE IMAGE.
  
  ILLUSTRATOR STYLE LOCK:
  - All panels MUST appear drawn by ONE single human comic illustrator, with a VERY SIMPLISTIC, BOLD STYLE.
  - The illustrator style is LOCKED from Panel 1 and MUST NOT change.
  - Line thickness, inking pressure, facial simplification (to cartoon level), and proportions MUST remain consistent.
  - No refinement, smoothing, or realism improvements are allowed in later panels.
  
  STRICT CARTOON COMIC STYLE:
  - STRICTLY 2D cartoon illustration ONLY.
  - EXTREMELY THICK, uneven black ink outlines (clearly visible and defining all shapes).
  - HEAVILY SIMPLIFIED facial features (bold cartoon proportions, NO anatomical accuracy).
  - COMPLETELY FLAT, POSTER-LIKE COLORS (NO gradients, NO blending, NO subtle color variations).
  - VERY SIMPLE cel shading (optional, 1 solid shadow tone maximum, applied as graphic blocks).
  - Halftone dots or solid, flat fills for shadows.
  - Significant exaggeration of heads, eyes, and expressions (child-friendly, like classic comics).
  
  ABSOLUTELY FORBIDDEN (ZERO TOLERANCE):
  - Real photos or photo-based rendering, NO PHOTOMANIPULATION.
  - Realistic or semi-realistic illustration, detailed illustration.
  - Painterly art, concept art, or AI-art polish, no sophisticated rendering.
  - Digital painting or smooth brush strokes, no airbrushing.
  - 3D, CGI, or rendered looks.
  - Pixar / Disney / DreamWorks, Anime / manga (THESE STYLES ARE TOO DETAILED AND REALISTIC).
  - Cinematic lighting, realistic shadows, blur, or depth-of-field.
  - Skin texture, fabric texture, pores, wrinkles, individual hair strands, or any form of lighting realism.
  
  REFERENCE IMAGE USAGE (IDENTITY EXTRACTION ONLY FOR CARTOON TRANSFORMATION):
  - The uploaded photo is ONLY to identify the basic face shape and body type for a CARTOON TRANSFORMATION.
  - DO NOT copy lighting, texture, or realism from the photo AT ALL.
  - Convert the character into a SIMPLIFIED, BOLD, GRAPHIC CARTOON COMIC CHARACTER.
  - The result must NEVER look like a real person, it must always look like a DRAWING.
  
  CHARACTER IDENTITY LOCK:
  - Once introduced, the character's CARTOON appearance is LOCKED.
  - Same simplified cartoon face shape, same cartoon features, same cartoon clothes, same flat colors, same cartoon hairstyle in ALL panels.
  - No costume changes, damage, aging, or visual variation.
  
  DESCRIPTION ENFORCEMENT:
  - Every scene description MUST repeat key cartoon traits and visual style
    (example: "a cartoon girl with big round cartoon eyes, wearing a simple red hoodie with flat colors, drawn with thick black outlines").
  
  FINAL VALIDATION RULE:
  - If the image looks like it could be mistaken for a real person or realistic illustration in ANY WAY, it is WRONG.
  - The image must clearly look like a BOLD, SIMPLIFIED CARTOON DRAWING at first glance.
  `;
  

  const prompt = `
    You are the engine of a comic-story creation app for kids.
    Your task is to generate a complete 5-panel comic story that fits on a single page.
    
    IMPORTANT: Use very simple, basic English suitable for young children (ages 5-8).
    
    Inputs:
    1. Characters: ${charsDescription}.
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
    - Visual Signature: Define a specific outfit for the main character (e.g., "red cape and blue shirt") and INCLUDE it in every 'scene' description.
    - Box 1: Scene Description (visuals) & Narration (simple text). Include specific character appearance details. Opening scene. Describe scenes as they would appear in a comic book (cartoon style, not realistic).
    - Box 2: Scene Description (visuals) & Narration (simple text). Ensure characters look identical to Box 1. Rising action. Describe in comic book style.
    - Box 3: Scene Description (visuals) & Narration (simple text). Maintain exact same character appearances. Development. Describe in comic book style.
    - Box 4: Scene Description (visuals) & Narration (simple text). Maintain exact same character appearances. Climax/turning point. Describe in comic book style.
    - Box 5: Scene Description (visuals) & Narration (simple text). Maintain exact same character appearances. CONCLUSION - must wrap up the story with a satisfying ending. Describe in comic book style.
    - Tone: Fun, exciting, and safe.
    - Safety: No violent, scary, or harmful content.
    - Style Note: All scene descriptions should be written with comic book illustration style in mind (cartoon, vibrant colors, bold outlines).
    - Character Context: The main character looks like the person in the uploaded photo, but rendered in comic book/cartoon style.
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
photo, photograph, photorealistic, realistic, ultra-detailed, hyperrealistic,
cinematic lighting, soft lighting, studio lighting, natural lighting,
3d render, blender, unreal engine,
digital painting, concept art, fine art, detailed brushstrokes,
anime, manga, chibi,
pixar, disney, dreamworks,
ai generated, midjourney style,
smooth shading, gradients, realism, complex textures, subtle highlights, skin pores, individual hair strands,
anatomically precise rendering, painterly style, airbrushed look
`;

  // Build enhanced prompt using character consistency utilities
  const consistencyPrompt = buildImagePromptWithConsistency(
    sceneDescription,
    characterNames,
    finalCharacterDescriptions,
    "the provided reference image"
  );

  const styleOverride = `
  STYLE OVERRIDE — READ FIRST:
  
  This is NOT a photo.
  This is NOT a realistic illustration.
  This is NOT digital painting or fine art.
  
  This image MUST be a LOW-FIDELITY, SIMPLISTIC, HAND-DRAWN CARTOON COMIC.
  Intentionally simple. Intentionally exaggerated.
  Looks like it was drawn with basic ink pens and solid color markers on paper.
  Think minimal detail, clear graphic shapes.
  `;

  // Combine negative guard with consistency prompt
  const basePrompt = `
  ${styleOverride}
  ${negativeStyleGuard}
  ${consistencyPrompt}
  `;

  // Final prompt with absolute style contract
  const prompt = `
${basePrompt}

==============================
ABSOLUTE STYLE CONTRACT (MUST FOLLOW)
==============================

This image MUST look like a CLASSIC AMERICAN COMIC BOOK PANEL,
specifically a CHILDRENS' COMIC, with an EXTREMELY CARTOONISH and SIMPLIFIED aesthetic.

CRITICAL INSTRUCTION: IDENTITY PRESERVATION (CARTOON AVATAR)
- The main character in this scene MUST LOOK EXACTLY like the person in the provided reference image,
  BUT AS A SIMPLIFIED, CARTOON AVATAR.
- Maintain the same facial features, hair color/style, and skin tone,
  but TRANSFORM them into a stylized, graphic comic representation.
- Keep the exact eye shape, nose shape, mouth shape, jawline, and ear shape,
  but RENDERED WITH SIMPLIFIED LINES AND FLAT SHAPES.
- Do not change the face structure - only convert it into a BOLD, CARTOON comic style.
- Same simplified CARTOON clothes, same flat colors, same CARTOON hairstyle, same CARTOON face in EVERY panel.
- AVOID ANY HINT OF PHOTO-REALISTIC DETAIL on the character's face, skin, or hair.

STYLE REQUIREMENTS (NON-NEGOTIABLE):
- Hand-drawn comic book illustration, HIGHLY CARTOONIZED
- EXTREMELY THICK black ink outlines around ALL characters and objects.
- COMPLETELY FLAT, SOLID COLORS (ABSOLUTELY NO gradients, NO soft shading, NO color blending)
- MINIMAL cel shading ONLY (1–2 harsh shadow tones max, applied as solid blocks of color)
- Halftone dot texture for shadows and backgrounds, IF APPLICABLE, otherwise solid blocks.
- Bold, high-contrast, PRIMARY color palette.
- Clearly exaggerated, cartoon proportions and expressions.
- Strictly 2D illustration ONLY.

REFERENCE STYLE:
- Classic Marvel / DC comic books (Silver–Bronze Age), focusing on the most simplified examples
- Saturday morning superhero comics for young children
- Vintage children's comic books from printed pages, specifically those with very simple, graphic art.
- Think Hanna-Barbera, Archie Comics, or very early superhero designs.

STRICTLY FORBIDDEN (DO NOT USE):
- Photorealism, semi-realism, hyperrealism
- Semi-realistic illustration, detailed illustration
- Digital painting, painterly styles, fine art rendering
- AI-art look, sophisticated rendering
- Pixar, Disney, DreamWorks style (TOO DETAILED)
- Anime or manga style (TOO DETAILED)
- 3D rendering
- Soft lighting, subtle lighting, atmospheric lighting
- Airbrushed shading, feathered edges
- Painterly textures, complex fabric textures
- Realistic skin, fabric, hair, or lighting details
- Cinematic lighting, depth-of-field blur, bokeh
- Any form of subtle shading or texture mapping.

IMPORTANT CHARACTER RULES:
- The uploaded photo is ONLY for establishing the core CARTOON IDENTITY and basic body shape.
- DO NOT copy lighting, skin texture, or realism from the photo AT ALL.
- Convert the character into a BOLD, GRAPHIC, CARTOON COMIC VERSION.
- The character must be instantly recognizable as the same *cartoonized* person from the reference image.

LAYOUT & COMPOSITION:
- ${panelLayout}
- ${aspectRatio}
- Clean, simple framing like a printed comic panel.
- No cropped faces or limbs.
- Center the main cartoon action clearly.

FINAL CHECK BEFORE OUTPUT:
Ask yourself: "Does this image look like a *very simple, hand-drawn, solid-color* children's comic book panel?"
If not, FIX IT until it is. Is it cartoonish enough? Is it flat enough?

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
    // Extract base64 and mime type
    const base64Data = imageBase64.split(',')[1];
    const mimeType = imageBase64.split(';')[0].split(':')[1] || 'image/jpeg';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
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

