// --- Dependencies ---
const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const yaml = require('js-yaml'); // <-- NEW: For parsing and stringifying YAML

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_AI_MODEL = process.env.GROQ_AI_MODEL || 'gemma2-9b-it';

const upload = multer({ dest: 'uploads/' });

// --- Helper Functions ---
const formatSpectralOutput = (spectralJsonString) => {
  // ... (no changes to this function)
  try {
    const results = JSON.parse(spectralJsonString);
    const formatted = {
      warnings: [],
      errors: [],
    };

    for (const item of results) {
      const newItem = {
        title: item.code,
        description: item.message,
        element: item.path.join('.'),
      };
      if (item.severity === 1) {
        formatted.warnings.push(newItem);
      } else {
        formatted.errors.push(newItem);
      }
    }
    return formatted;
  } catch (e) {
    return { warnings: [], errors: [] };
  }
};

// --- NEW AI Helper: Now fixes a specific chunk of YAML ---
const callAiWithChunk = async (yamlChunkString, issuesChunk) => {
  const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

  const prompt = `
You are an expert API developer specializing in OpenAPI specifications.
Below is a section of an OpenAPI YAML file and a list of validation errors that apply ONLY to this section.
Your task is to fix this YAML section to resolve the issues.
Return ONLY the corrected YAML for the section you were given. Do not add explanations or surrounding text.

**YAML Section to Fix:**
\`\`\`yaml
${yamlChunkString}
\`\`\`

**Spectral Issues to Fix in this section:**
\`\`\`json
${JSON.stringify(issuesChunk, null, 2)}
\`\`\`

**Corrected YAML Section:**
`;

  const payload = {
    messages: [{ role: "user", content: prompt }],
    model: GROQ_AI_MODEL,
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`AI API Error: ${response.status} ${response.statusText}. Response Body:`, errorBody);
      return `AI fix failed: API returned status ${response.status}. Details: ${errorBody}`;
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;

    if (!text) {
      return "AI fix failed: Could not extract corrected YAML from AI response.";
    }
    
    // Extract content from a potential markdown block, or just trim it.
    const yamlMatch = text.match(/```yaml\n([\s\S]*?)\n```/);
    return yamlMatch ? yamlMatch[1] : text.trim();

  } catch (error) {
    console.error('Error calling AI API:', error);
    return "AI fix failed: An exception occurred.";
  }
};

// --- REWRITTEN AI Orchestrator: Intelligent Chunking Logic ---
const getAiFixes = async (initialYamlContent, spectralIssues) => {
  if (!GROQ_API_KEY) {
    return "AI fix skipped: GROQ_API_KEY not configured.";
  }

  try {
    let mainYamlObject = yaml.load(initialYamlContent);
    const allIssues = [...spectralIssues.errors, ...spectralIssues.warnings];

    // Group errors by the top-level key they belong to (e.g., a specific path, components, info)
    const errorsByChunkKey = allIssues.reduce((acc, issue) => {
      const elementParts = issue.element.split('.');
      const key = elementParts.length > 1 && elementParts[0] === 'paths' 
        ? `${elementParts[0]}.${elementParts[1]}` // Group by individual path, e.g., "paths./users"
        : elementParts[0]; // Group by top-level key like "info", "components"
      
      if (!acc[key]) acc[key] = [];
      acc[key].push(issue);
      return acc;
    }, {});

    console.log(`Grouped issues into ${Object.keys(errorsByChunkKey).length} YAML chunks.`);

    // Iteratively fix each chunk of the main YAML object
    for (const key in errorsByChunkKey) {
      let issuesForChunk = errorsByChunkKey[key];
      const CHUNK_SIZE = 5;

      // Determine which part of the yaml object to send
      let yamlChunkObject;
      let objectPathParts = key.split('.');
      if (objectPathParts.length > 1) { // This is a specific path, e.g., "paths./users"
        yamlChunkObject = { [objectPathParts[1]]: mainYamlObject.paths[objectPathParts[1]] };
      } else { // This is a top-level object like "info" or "components"
        yamlChunkObject = { [key]: mainYamlObject[key] };
      }
      
      console.log(`Processing YAML chunk "${key}" with ${issuesForChunk.length} issues.`);

      // Still chunk errors within the YAML chunk if there are many
      while (issuesForChunk.length > 0) {
        const errorChunk = issuesForChunk.splice(0, CHUNK_SIZE);
        const yamlChunkString = yaml.dump(yamlChunkObject);

        const fixedChunkString = await callAiWithChunk(yamlChunkString, errorChunk);

        if (fixedChunkString.startsWith('AI fix failed:')) {
          return fixedChunkString; // Abort on any failure
        }

        try {
          const fixedChunkObject = yaml.load(fixedChunkString);
          // Merge the fixed chunk back into the main object
          if (objectPathParts.length > 1) {
             Object.assign(mainYamlObject.paths, fixedChunkObject);
          } else {
             Object.assign(mainYamlObject, fixedChunkObject);
          }
          // Update the object for the next iteration (if any)
          yamlChunkObject = fixedChunkObject; 
        } catch (e) {
          console.error("Failed to parse or merge AI response:", e);
          return "AI fix failed: Could not parse YAML response from AI.";
        }
      }
    }
    
    console.log("Finished all AI fix iterations. Serializing final YAML.");
    return yaml.dump(mainYamlObject);

  } catch (e) {
    console.error("An error occurred during the AI fixing process:", e);
    return "AI fix failed: A critical error occurred while processing the YAML.";
  }
};

// --- API Endpoint ---
app.post('/yaml/validate', upload.single('file'), (req, res) => {
  // ... (no changes to this function, it will now call the new getAiFixes orchestrator)
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const absoluteFilePath = path.resolve(filePath);
  const rulesetPath = path.resolve('.spectral.yaml');
  
  const originalYamlContent = fs.readFileSync(absoluteFilePath, 'utf8');

  const command = `spectral lint "${absoluteFilePath}" --ruleset "${rulesetPath}" --format=json`;
  console.log(`Executing command: ${command}`);

  exec(command, (error, stdout, stderr) => {
    fs.unlink(filePath, (err) => {
      if (err) console.error(`Failed to delete temporary file: ${filePath}`, err);
    });

    if (stderr && !stdout) {
        console.error(`Spectral execution error: ${stderr}`);
        return res.status(500).json({ error: 'Failed to run spectral validation.', details: stderr });
    }

    try {
      const spectralOutput = stdout ? stdout : '[]'; 
      const spectralJsonResponse = formatSpectralOutput(spectralOutput);

      if (spectralJsonResponse.errors.length === 0 && spectralJsonResponse.warnings.length === 0) {
        return res.status(200).json({
          ...spectralJsonResponse,
          "fixed-yaml-file": "No issues found. Original YAML is valid."
        });
      }

      getAiFixes(originalYamlContent, spectralJsonResponse)
        .then(fixedYaml => {
            const finalResponse = {
                ...spectralJsonResponse,
                "fixed-yaml-file": fixedYaml
            };
            res.status(200).json(finalResponse);
        })
        .catch(aiError => {
            console.error('AI Fix function failed:', aiError);
            res.status(500).json({ error: 'The AI fix process failed.', details: aiError.message });
        });

    } catch (parseError) {
      console.error('Error parsing Spectral output:', parseError);
      res.status(500).json({ error: 'Failed to parse validation results.', rawOutput: stdout });
    }
  });
});

// --- Server Startup ---
app.listen(PORT, () => {
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }
  console.log(`Server is running on http://localhost:${PORT}`);
});
