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
CRITICAL CHARACTER CONSISTENCY REQUIREMENTS:
- Characters MUST maintain the exact same appearance across ALL panels
- Once a character is introduced, their physical features, clothing, hair color, facial features, body type, and accessories MUST remain identical in every subsequent panel
- The main character (${mainChar}) should look like the person in the uploaded photo in ALL panels (but will be rendered in comic book/cartoon style)
- Include specific visual details in scene descriptions to ensure consistency (e.g., "wearing the same blue shirt", "same hairstyle", "same facial features")
- The character's look should NEVER change between panels - no different clothing, hairstyles, or physical features
- All images will be generated in classic American comic book illustration style (cartoon/comic style, not realistic)
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

  // Build enhanced prompt using character consistency utilities
  const basePrompt = buildImagePromptWithConsistency(
    sceneDescription,
    characterNames,
    finalCharacterDescriptions,
    "the provided reference image"
  );

  // Add aspect ratio and layout information with STRICT comic book style enforcement
  const prompt = `${basePrompt}

REMINDER - STYLE IS CRITICAL:
- This MUST be a classic American comic book illustration - cartoon style, NOT realistic
- The reference image is ONLY for character appearance - transform it into comic book style
- Use bold black outlines, flat vibrant colors, halftone shading
- NO photographic realism - this is a children's comic book panel
- Characters should be cartoon versions, not photorealistic copies

IMPORTANT LAYOUT REQUIREMENTS:
- This image will be displayed in a ${panelLayout}
- Use ${aspectRatio} aspect ratio
- Ensure the composition fits well in this format without stretching or distortion
- Center the main action/subject in the frame
- Make sure important elements are not cut off at the edges
- Maintain proper aspect ratio - do not stretch or distort the image`;

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

