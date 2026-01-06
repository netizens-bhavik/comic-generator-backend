import { GoogleGenAI, Modality, Type } from "@google/genai";
import { 
  buildImagePromptWithConsistency,
  createCharacterDescription,
  extractCharacterDescriptionsFromScript,
  CharacterDescription
} from "./characterConsistency.js";

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
  Generate a high-quality portrait of a ${gender} in professional comic book/manga illustration style.

  CRITICAL INSTRUCTION: EXACT COMIC BOOK CHARACTER REPLICA
  - The face in the output image MUST closely resemble the face in the input image, rendered in comic book/manga style.
  - TRANSFORM the facial features into a professional comic book/manga representation while maintaining recognition.
  - Keep the exact eye shape, nose shape, mouth shape, jawline, and ear shape, but RENDERED WITH BOLD LINES AND VIBRANT COLORS.
  - Keep the exact hair style and hair color, but RENDERED IN COMIC BOOK STYLE.
  - Transform the art style to professional comic book/manga illustration (bold lines, vibrant colors, proper cel shading), do NOT use photorealistic rendering.
  - The background should be a solid color or simple gradient suitable for comic book art.
  - Close-up shot (head and shoulders, or chest up).
  
  STYLE REQUIREMENTS (NON-NEGOTIABLE):
  - Professional comic book/manga illustration style.
  - Bold, defined black ink outlines around features, hair, and edges.
  - Vibrant, solid colors with proper cel shading for depth.
  - Professional cel shading with proper shadow tones for dimension.
  - Hand-drawn, graphic, bold comic book appearance.
  - 2D illustration style.
  
  STRICTLY FORBIDDEN (DO NOT USE):
  - Photorealism, realistic rendering, hyperrealism, semi-realism, fine art.
  - 3D appearance, CGI, rendered looks.
  - Digital painting style, soft brush strokes, painterly effects.
  - Subtle lighting, realistic shadows, atmospheric effects, depth-of-field.
  - Skin texture, hair texture, pores, wrinkles, or any form of realistic detail.
  - Any AI-art polish or smooth rendering that looks too realistic.
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
  
  COMIC BOOK ILLUSTRATION MODE:
  - ALL images MUST be fully illustrated in professional comic book/manga illustration style.
  - The output MUST look like hand-drawn comic book art with bold, defined lines.
  - The image MUST resemble professional comic book/manga panel illustrations.
  - BOLD, VISIBLE LINE ART MUST DOMINATE THE IMAGE.
  
  ILLUSTRATOR STYLE LOCK:
  - All panels MUST appear drawn by ONE single comic illustrator, with a consistent, bold style.
  - The illustrator style is LOCKED from Panel 1 and MUST remain consistent throughout.
  - Line thickness, inking pressure, character proportions, and visual style MUST remain consistent.
  - Maintain the same illustration style level across all panels.
  
  COMIC BOOK/MANGA ILLUSTRATION STYLE:
  - Use professional comic book/manga illustration style.
  - Apply BOLD, defined black ink outlines (clearly visible and defining all shapes).
  - Use well-defined facial features with proper comic book proportions.
  - Apply vibrant colors using solid color blocks with professional shading.
  - Use cel shading with proper shadow tones for depth and dimension.
  - Apply halftone dots or solid fills for shadows and effects.
  - Use expressive character designs suitable for comic book storytelling.
  
  REFERENCE IMAGE USAGE (IDENTITY EXTRACTION FOR COMIC TRANSFORMATION):
  - Use the uploaded photo to identify the basic face shape and body type for comic book transformation.
  - Extract facial features, hair style, and clothing from the reference image.
  - Convert the character into a professional comic book/manga character.
  - Render the character in proper comic book illustration style with bold lines and vibrant colors.
  
  CHARACTER IDENTITY LOCK:
  - Once introduced, the character's appearance is LOCKED.
  - Use the same face shape, features, clothes, colors, and hairstyle in ALL panels.
  - Maintain consistent character appearance without costume changes, damage, aging, or visual variation.
  
  DESCRIPTION ENFORCEMENT:
  - Every scene description MUST repeat key character traits and visual style
    (example: "a character with distinctive features, wearing specific clothing, rendered in comic book style with bold outlines").
  
  FINAL VALIDATION RULE:
  - The image must clearly look like a professional comic book/manga illustration.
  - Ensure the style is consistent with quality comic book and manga art.
  `;
  

  const prompt = `
    You are the engine of a comic-story creation app.
    Your task is to generate a complete 5-panel comic story that fits on a single page.
    
    IMPORTANT: Use clear, engaging English suitable for teenagers and general audiences.
    
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
    - Title: A catchy, engaging name for this story.
    - Visual Signature: Define a specific outfit for the main character (e.g., "red cape and blue shirt") and INCLUDE it in every 'scene' description.
    - Box 1: Scene Description (visuals) & Narration (engaging text). Include specific character appearance details. Opening scene. Describe scenes as they would appear in a comic book/manga illustration.
    - Box 2: Scene Description (visuals) & Narration (engaging text). Ensure characters look identical to Box 1. Rising action. Describe in comic book/manga style.
    - Box 3: Scene Description (visuals) & Narration (engaging text). Maintain exact same character appearances. Development. Describe in comic book/manga style.
    - Box 4: Scene Description (visuals) & Narration (engaging text). Maintain exact same character appearances. Climax/turning point. Describe in comic book/manga style.
    - Box 5: Scene Description (visuals) & Narration (engaging text). Maintain exact same character appearances. CONCLUSION - must wrap up the story with a satisfying ending. Describe in comic book/manga style.
    - Tone: Engaging, exciting, and appropriate for all ages.
    - Safety: No excessive violence, inappropriate, or harmful content.
    - Style Note: All scene descriptions should be written with comic book/manga illustration style in mind (bold lines, vibrant colors, professional illustration quality).
    - Character Context: The main character looks like the person in the uploaded photo, but rendered in proper comic book/manga illustration style.
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

  // All images must be in 4:3 aspect ratio regardless of input image dimensions
  const aspectRatio = "4:3 landscape format (wider than tall) - MANDATORY: Output must be 4:3 even if input image has different aspect ratio";
  
  const panelLayout = panelIndex === 5
    ? "full-width panel at the bottom of the page"
    : "side-by-side panel in the top or middle row";

  // Build enhanced prompt using character consistency utilities
  const consistencyPrompt = buildImagePromptWithConsistency(
    sceneDescription,
    characterNames,
    finalCharacterDescriptions,
    "the provided reference image"
  );

  // Final prompt with detailed positive requirements
  const prompt = `
${consistencyPrompt}

==============================
DETAILED STYLE REQUIREMENTS
==============================

IMAGE TYPE:
This image MUST be a professional comic book/manga panel illustration suitable for all ages.
The aesthetic must be high-quality comic book/manga illustration style with professional appearance.

CRITICAL ASPECT RATIO REQUIREMENT:
- The output image MUST be in 4:3 aspect ratio (landscape format, wider than tall).
- IGNORE the aspect ratio of the input/reference image completely.
- The generated output MUST ALWAYS be 4:3 regardless of the uploaded image's dimensions (square, portrait, landscape, etc.).
- Do NOT match or preserve the input image's aspect ratio - always output 4:3.

CHARACTER IDENTITY PRESERVATION:
- Transform the main character from the reference image into a comic book/manga character
- Maintain the same facial features: eye shape, nose shape, mouth shape, jawline, and ear shape
- Preserve hair color, hair style, and skin tone from the reference image
- Keep the same body proportions and basic body shape
- Render all features with bold lines and vibrant colors in comic book style
- Apply the same comic book/manga appearance consistently across all panels
- Use the same clothes, colors, and hairstyle in every panel
- Ensure the character is instantly recognizable as the comic book version of the reference person

ART STYLE REQUIREMENTS:
- Professional comic book/manga illustration style
- Bold, defined black ink outlines around characters, objects, and elements
- Vibrant colors with proper shading and depth
- Use solid color blocks with professional cel shading
- Apply proper shadow tones for depth and dimension
- Use halftone dot texture for shadows and backgrounds when applicable
- Apply bold, high-contrast color palette suitable for comic book art
- Use expressive character proportions and expressions
- Render as 2D illustration with clear, defined forms
- Maintain professional illustration quality with proper detail and composition

REFERENCE STYLE INSPIRATION:
- Classic Marvel / DC comic books from Silver-Bronze Age
- Modern comic book illustration styles
- Professional manga illustration styles
- Quality graphic novel art
- Contemporary comic book art styles
- Professional superhero comic designs

CHARACTER TRANSFORMATION PROCESS:
- Use the uploaded photo to establish the core character identity and basic body shape
- Extract facial features, hair style, and clothing from the reference image
- Transform these elements into professional comic book/manga character design
- Render with bold lines, vibrant colors, and proper comic book proportions
- Ensure the character looks like a professional comic book illustration, not a photograph

LAYOUT & COMPOSITION REQUIREMENTS:
- Panel Layout: ${panelLayout}
- CRITICAL ASPECT RATIO REQUIREMENT: The output image MUST be in 4:3 aspect ratio (landscape format, wider than tall).
- IGNORE the aspect ratio of the input/reference image - the generated output MUST ALWAYS be 4:3 regardless of the uploaded image's dimensions.
- Use clean, simple framing like a printed comic panel
- Ensure complete characters are visible (no cropped faces or limbs)
- Center the main action clearly within the frame
- Maintain proper composition with balanced elements
- The image must be exactly 4:3 landscape format - do not match the input image's aspect ratio

TECHNICAL REQUIREMENTS:
- High quality, colorful, professional comic book/manga illustration
- Clear character designs with well-defined features
- Proper composition that fits the panel format
- Maintain proper proportions without distortion or stretching
- Balanced framing with important elements centered
- Vibrant, engaging color palette suitable for all ages
- Consistent visual style throughout the panel
- Output as a clean, printable comic book panel image

OUTPUT REQUIREMENT:
Generate ONLY the image. Do not include any text, captions, or dialogue in the image itself.
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

