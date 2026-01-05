import { GoogleGenAI, Modality, Type } from "@google/genai";

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
- The main character (${mainChar}) should look like the person in the uploaded photo in ALL panels
- Include specific visual details in scene descriptions to ensure consistency (e.g., "wearing the same blue shirt", "same hairstyle", "same facial features")
- The character's look should NEVER change between panels - no different clothing, hairstyles, or physical features
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
    - Box 1: Scene Description (visuals) & Narration (simple text). Include specific character appearance details. Opening scene.
    - Box 2: Scene Description (visuals) & Narration (simple text). Ensure characters look identical to Box 1. Rising action.
    - Box 3: Scene Description (visuals) & Narration (simple text). Maintain exact same character appearances. Development.
    - Box 4: Scene Description (visuals) & Narration (simple text). Maintain exact same character appearances. Climax/turning point.
    - Box 5: Scene Description (visuals) & Narration (simple text). Maintain exact same character appearances. CONCLUSION - must wrap up the story with a satisfying ending.
    - Tone: Fun, exciting, and safe.
    - Safety: No violent, scary, or harmful content.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
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
  panelIndex?: number
): Promise<string> => {
  const ai = getAiClient();

  const aspectRatio = panelIndex === 5 
    ? "16:9 landscape format (wider than tall)" 
    : "4:3 or square format (slightly wider than tall)";
  
  const panelLayout = panelIndex === 5
    ? "full-width panel at the bottom of the page"
    : "side-by-side panel in the top or middle row";

  const mainChar = characterNames[0] || "The Hero";
  const prompt = `${sceneDescription}

CRITICAL CHARACTER CONSISTENCY:
- The main character (${mainChar}) MUST look like the person in the provided reference image
- Maintain exact same appearance, clothing, hairstyle, and physical features as shown in the reference
- Character appearance must be consistent across all panels

CRITICAL STYLE REQUIREMENTS - MUST BE STRICTLY ENFORCED:
- Generate this image EXCLUSIVELY in classic American comic book style
- Use bold, black ink outlines and borders around all characters and objects
- Apply vibrant, saturated colors typical of comic books (no realistic/photographic style)
- Include halftone dots or crosshatching patterns for shading (comic book style shading)
- Use strong contrast between foreground and background
- Style should resemble Marvel, DC, or classic comic book illustrations
- NO realistic photography style, NO watercolor, NO soft pastel styles
- MUST look like a traditional printed comic book panel

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
    return originalImageBase64;
  } catch (error) {
    console.error("Error generating panel image, falling back to original:", error);
    return originalImageBase64; 
  }
};

export const editImageWithGemini = async (
  imageBase64: string,
  prompt: string
): Promise<string> => {
  const ai = getAiClient();

  try {
    const base64Data = imageBase64.split(',')[1];

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
    
    throw new Error("No image data returned from Gemini.");
  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
};

