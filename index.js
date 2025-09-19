// --- Dependencies ---
const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // For making API calls to the AI

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3000;
// SWITCHING TO GROQ API KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY; // Get API Key from Render environment variables
const GROQ_AI_MODEL = process.env.GROQ_AI_MODEL; // Get API Key from Render environment variables

const upload = multer({ dest: 'uploads/' });

// --- Helper Function ---
const formatSpectralOutput = (spectralJsonString) => {
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
      if (item.severity === 1) { // 1 for warning
        formatted.warnings.push(newItem);
      } else { // 0 for error
        formatted.errors.push(newItem);
      }
    }
    return formatted;
  } catch (e) {
    // If parsing fails, return an empty structure
    return { warnings: [], errors: [] };
  }
};

// --- UPDATED AI Helper Function for Groq ---
const getAiFixes = async (yamlContent, spectralIssues) => {
  if (!GROQ_API_KEY) {
    console.log("GROQ_API_KEY not found. Skipping AI fix.");
    return "AI fix skipped: GROQ_API_KEY not configured on the server.";
  }

  const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

  const prompt = `
You are an expert API developer specializing in OpenAPI specifications.
Below is an OpenAPI YAML file and a list of validation errors from the Spectral linter.
Your task is to fix the YAML file to resolve these issues.
Only return the complete, corrected YAML content inside a single YAML block. Do not include any other text or explanations.

**Original YAML:**
\`\`\`yaml
${yamlContent}
\`\`\`

**Spectral Issues (JSON):**
\`\`\`json
${JSON.stringify(spectralIssues, null, 2)}
\`\`\`

**Corrected YAML:**
`;

  // Groq uses an OpenAI-compatible request structure
  const payload = {
    messages: [{
      role: "user",
      content: prompt,
    }],
    model: GROQ_AI_MODEL, // Using a fast, capable model
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
        console.error(`AI API Error: ${response.statusText}`, errorBody);
        return `AI fix failed: API returned status ${response.status}.`;
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;

    if (!text) {
        console.error("AI API Error: No text in response.", JSON.stringify(result, null, 2));
        return "AI fix failed: Could not extract corrected YAML from AI response.";
    }
    
    // Clean the response to get only the YAML block
    const yamlMatch = text.match(/```yaml\n([\s\S]*?)\n```/);
    return yamlMatch ? yamlMatch[1] : text.trim();

  } catch (error) {
    console.error('Error calling AI API:', error);
    return "AI fix failed: An exception occurred while contacting the AI service.";
  }
};


// --- API Endpoint ---
app.post('/yaml/validate', upload.single('file'), (req, res) => {
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
      // If stdout is empty, it means no issues were found.
      const spectralOutput = stdout ? stdout : '[]'; 
      const spectralJsonResponse = formatSpectralOutput(spectralOutput);

      // If there are no errors or warnings, we can skip the AI call.
      if (spectralJsonResponse.errors.length === 0 && spectralJsonResponse.warnings.length === 0) {
        return res.status(200).json({
          ...spectralJsonResponse,
          "fixed-yaml-file": "No issues found. Original YAML is valid."
        });
      }

      // Call the AI agent if there are issues
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


