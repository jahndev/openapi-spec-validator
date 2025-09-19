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
// We'll save files to a temporary 'uploads' directory.
const upload = multer({ dest: 'uploads/' });

// --- API Endpoint ---
// Sets up the POST endpoint at /yaml/validate
// 'upload.single('file')' is the middleware that handles the file upload.
// It expects the form field name to be 'file'.
app.post('/yaml/validate', upload.single('file'), (req, res) => {
  // 1. Check if a file was actually uploaded
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  // Use path.resolve to get an absolute path, which is safer for shell commands
  const absoluteFilePath = path.resolve(filePath);

  // 2. Construct the Spectral CLI command
  const command = `spectral lint ${absoluteFilePath}`;
  console.log(`Executing command: ${command}`);

  // 3. Execute the command
  exec(command, (error, stdout, stderr) => {
    // 4. Clean up: ALWAYS delete the temporary file afterwards
    fs.unlink(filePath, (err) => {
      if (err) console.error(`Failed to delete temporary file: ${filePath}`, err);
    });

    // Spectral returns a non-zero exit code (triggering 'error') when it finds issues.
    // This is expected behavior. The actual linting result is in stdout/stderr.
    // So, we always return the output, regardless of the exit code.
    console.log(`Spectral stdout: ${stdout}`);
    if (stderr) console.error(`Spectral stderr: ${stderr}`);

    // 5. Send the result back to the client
    // Set content-type to plain text for better readability of CLI output
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(stdout || stderr);
  });
});

// --- Server Startup ---
app.listen(PORT, () => {
  // Create the uploads directory if it doesn't exist on startup
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }
  console.log(`Server is running on http://localhost:${PORT}`);
});
