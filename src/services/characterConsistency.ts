/**
 * Character Consistency Management
 * 
 * This module handles character face consistency across comic panels
 * by maintaining detailed character descriptions and ensuring they're
 * used consistently in image generation prompts.
 */

export interface CharacterDescription {
  name: string;
  physicalDescription: string;
  clothing?: string;
  accessories?: string;
  facialFeatures?: string;
  bodyType?: string;
  consistentFeatures: string; // Key features that must remain the same
}

export interface CharacterConsistencyConfig {
  maintainConsistentCast: boolean;
  consistencyPrompt: string;
  exampleCharacters?: Record<string, string>;
}

/**
 * Default character consistency configuration
 */
export const defaultConsistencyConfig: CharacterConsistencyConfig = {
  maintainConsistentCast: true,
  consistencyPrompt: "CRITICAL: The character MUST maintain the exact same appearance, facial features, clothing, and visual style as described. No changes in clothing, hair, facial features, or physical characteristics between panels. Characters should be rendered in proper comic book/manga illustration style while maintaining their recognizable appearance.",
  exampleCharacters: {
    "Hero": "A character with consistent facial features, hair color, eye color, and clothing style throughout all panels, rendered in comic book illustration style.",
    "Sidekick": "A character with consistent appearance matching their initial description in every panel, rendered in comic book illustration style."
  }
};

/**
 * Extract character description from script or create default
 */
export function createCharacterDescription(
  name: string,
  referenceImage?: string,
  additionalDetails?: string
): CharacterDescription {
  const baseDescription = `Named ${name}, a character with consistent appearance throughout the comic.`;
  
  const physicalDescription = additionalDetails 
    ? `${baseDescription} ${additionalDetails}`
    : `${baseDescription} Maintains the same facial features, hair style, and clothing as shown in the reference image.`;

  return {
    name,
    physicalDescription,
    consistentFeatures: `Facial features, hair color/style, eye color, body proportions, and clothing style must remain identical across all panels.`
  };
}

/**
 * Build character consistency prompt for image generation
 */
export function buildCharacterConsistencyPrompt(
  characterDescriptions: CharacterDescription[],
  config: CharacterConsistencyConfig = defaultConsistencyConfig
): string {
  if (!config.maintainConsistentCast || characterDescriptions.length === 0) {
    return "";
  }

  const characterDetails = characterDescriptions.map(char => {
    return `${char.name}: ${char.physicalDescription}. ${char.consistentFeatures}`;
  }).join(" | ");

  return `
CHARACTER CONSISTENCY REQUIREMENTS:
${characterDetails}

${config.consistencyPrompt}
`.trim();
}

/**
 * Enhance scene description with character consistency information
 */
export function enhanceSceneWithCharacters(
  sceneDescription: string,
  characterNames: string[],
  characterDescriptions: CharacterDescription[]
): string {
  const relevantDescriptions = characterDescriptions.filter(desc => 
    characterNames.some(name => 
      desc.name.toLowerCase().includes(name.toLowerCase()) || 
      name.toLowerCase().includes(desc.name.toLowerCase())
    )
  );

  if (relevantDescriptions.length === 0) {
    return sceneDescription;
  }

  const characterContext = relevantDescriptions
    .map(desc => `${desc.name} (${desc.physicalDescription})`)
    .join(", ");

  return `${sceneDescription}. Characters present: ${characterContext}. Ensure these characters maintain their exact appearance as described.`;
}

/**
 * Extract character descriptions from AI-generated script
 * This parses the script response to find character information
 */
export function extractCharacterDescriptionsFromScript(
  scriptResponse: any,
  characterNames: string[],
  referenceImage?: string
): CharacterDescription[] {
  const descriptions: CharacterDescription[] = [];

  // Try to extract from script if it includes character descriptions
  if (scriptResponse.character_descriptions) {
    for (const [name, desc] of Object.entries(scriptResponse.character_descriptions)) {
      descriptions.push({
        name,
        physicalDescription: desc as string,
        consistentFeatures: "Maintain exact appearance as described."
      });
    }
  }

  // If no descriptions found, create them from character names
  if (descriptions.length === 0) {
    characterNames.forEach(name => {
      descriptions.push(createCharacterDescription(name, referenceImage));
    });
  }

  return descriptions;
}

/**
 * Build comprehensive image generation prompt with character consistency
 */
export function buildImagePromptWithConsistency(
  sceneDescription: string,
  characterNames: string[],
  characterDescriptions: CharacterDescription[],
  referenceImageContext: string = "the provided reference image"
): string {
  const consistencyPrompt = buildCharacterConsistencyPrompt(characterDescriptions);
  const enhancedScene = enhanceSceneWithCharacters(sceneDescription, characterNames, characterDescriptions);

  const mainCharacter = characterNames[0];
  const characterContext = characterNames.length > 0
    ? `The main character ${mainCharacter} MUST closely resemble the person in ${referenceImageContext}, rendered in proper comic book/manga illustration style. Maintain their facial features, clothing, and appearance with bold lines and vibrant colors.`
    : "";

  return `
Create a comic book panel illustration.
Style: Comic book/manga style, bold lines, vibrant colors, professional illustration quality.
Scene: ${enhancedScene}

${characterContext}

${consistencyPrompt}

Ensure the image is high quality and colorful. The main character in this scene MUST resemble the person in the provided reference image, rendered in proper comic book/manga illustration style.
`.trim();
}

