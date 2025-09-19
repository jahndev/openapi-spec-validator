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

// --- REFACTORED Helper Function ---
/**
 * Parses the raw JSON string output from Spectral into a more useful and
 * detailed structured object.
 * @param {string} spectralJsonString - The JSON string from Spectral's stdout.
 * @returns {object} - A structured object with a summary and a detailed list of issues.
 */
const formatSpectralOutput = (spectralJsonString) => {
  const formatted = {
    summary: {
      status: 'valid',
      errorCount: 0,
      warningCount: 0,
      totalIssues: 0,
    },
    issues: [],
  };

  try {
    const results = JSON.parse(spectralJsonString);
    if (results.length === 0) {
      return formatted; // Return the default valid state
    }

    const severityMap = {
      0: 'error',
      1: 'warn',
      2: 'info',
      3: 'hint',
    };

    for (const item of results) {
      const severity = severityMap[item.severity] || 'unknown';

      if (severity === 'error') {
        formatted.summary.errorCount++;
      } else if (severity === 'warn') {
        formatted.summary.warningCount++;
      }

      formatted.issues.push({
        severity: severity,
        rule: item.code,
        message: item.message,
        path: item.path,
        location: {
          // Spectral's range is 0-indexed, so we add 1 for human-readable line/char numbers
          line: item.range.start.line + 1,
          character: item.range.start.character + 1,
        },
      });
    }
    
    // Sort issues by line number for easier reading
    formatted.issues.sort((a, b) => a.location.line - b.location.line);

    // Calculate final summary status
    formatted.summary.totalIssues = results.length;
    if (formatted.summary.errorCount > 0) {
      formatted.summary.status = 'invalid';
    } else if (formatted.summary.warningCount > 0) {
      formatted.summary.status = 'valid_with_warnings';
    }

    return formatted;
  } catch (e) {
    console.error("Error parsing Spectral JSON:", e);
    // On parsing failure, return a structured error
    return {
      summary: {
        status: 'error',
        message: 'Failed to parse Spectral output.'
      },
      issues: [],
      rawError: e.message
    };
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

    // Handle cases where Spectral might return no output for a valid file
    const spectralOutput = stdout ? stdout : '[]';
    const spectralJsonResponse = formatSpectralOutput(spectralOutput);

    // Use a 422 status code if the document is invalid, which is more specific than 200
    if (spectralJsonResponse.summary.status === 'invalid') {
        return res.status(422).json(spectralJsonResponse);
    }
    
    res.status(200).json(spectralJsonResponse);
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

