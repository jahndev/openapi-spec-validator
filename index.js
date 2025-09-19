// --- Dependencies ---
const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3000; // Render sets the PORT environment variable

// Configure multer for file uploads.
const upload = multer({ dest: 'uploads/' });

// --- Helper Function ---
// This function will parse the raw JSON output from Spectral and transform it.
const formatSpectralOutput = (spectralJsonString) => {
  const results = JSON.parse(spectralJsonString);
  const formatted = {
    warnings: [],
    errors: [],
  };

  for (const item of results) {
    const newItem = {
      title: item.code,
      description: item.message,
      // Join the path array into a dot-separated string for clarity.
      element: item.path.join('.'),
    };

    // Spectral uses severity levels: 0 for error, 1 for warning.
    if (item.severity === 1) {
      formatted.warnings.push(newItem);
    } else {
      formatted.errors.push(newItem);
    }
  }

  return formatted;
};


// --- API Endpoint ---
app.post('/yaml/validate', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const absoluteFilePath = path.resolve(filePath);
  const rulesetPath = path.resolve('.spectral.yaml');

  // 2. Construct the Spectral CLI command with JSON format output
  // We add --format=json to get machine-readable output.
  const command = `spectral lint "${absoluteFilePath}" --ruleset "${rulesetPath}" --format=json`;
  console.log(`Executing command: ${command}`);

  exec(command, (error, stdout, stderr) => {
    // 4. Clean up the temporary file
    fs.unlink(filePath, (err) => {
      if (err) console.error(`Failed to delete temporary file: ${filePath}`, err);
    });
    
    // If there's a serious execution error (not a linting error), return it.
    if (stderr && !stdout) {
        console.error(`Spectral execution error: ${stderr}`);
        return res.status(500).json({ error: 'Failed to run spectral validation.', details: stderr });
    }

    try {
      // 5. Parse and format the output
      // Even with linting "errors", Spectral outputs valid JSON to stdout
      const jsonResponse = formatSpectralOutput(stdout);
      res.status(200).json(jsonResponse);
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
