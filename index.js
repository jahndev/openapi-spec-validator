// --- Dependencies ---
const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

// --- Helper Function ---
/**
 * Parses the raw JSON string output from Spectral into a structured object.
 * @param {string} spectralJsonString - The JSON string from Spectral's stdout.
 * @returns {{warnings: Array, errors: Array}} - A structured object with warnings and errors.
 */
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
    console.error("Error parsing Spectral JSON:", e);
    // If parsing fails, return an empty structure
    return { warnings: [], errors: [] };
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

  const command = `spectral lint "${absoluteFilePath}" --ruleset "${rulesetPath}" --format=json`;
  console.log(`Executing command: ${command}`);

  exec(command, (error, stdout, stderr) => {
    // Always delete the temporary file after execution
    fs.unlink(filePath, (err) => {
      if (err) console.error(`Failed to delete temporary file: ${filePath}`, err);
    });

    if (stderr && !stdout) {
        console.error(`Spectral execution error: ${stderr}`);
        return res.status(500).json({ error: 'Failed to run spectral validation.', details: stderr });
    }

    try {
      // Handle cases where Spectral might return no output for a valid file
      const spectralOutput = stdout ? stdout : '[]'; 
      const spectralJsonResponse = formatSpectralOutput(spectralOutput);

      res.status(200).json(spectralJsonResponse);

    } catch (parseError) {
      console.error('Error parsing Spectral output:', parseError);
      res.status(500).json({ error: 'Failed to parse validation results.', rawOutput: stdout });
    }
  });
});

// --- Server Startup ---
app.listen(PORT, () => {
  // Ensure the uploads directory exists
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }
  console.log(`Server is running on http://localhost:${PORT}`);
});
