# OpenAPI Spec Validator API

![Validation Workflow](https://img.shields.io/badge/API-Validation%20Service-blue)
![Built with Node.js](https://img.shields.io/badge/Built%20with-Node.js-green)
![Powered by Spectral](https://img.shields.io/badge/Powered%20by-Spectral-purple)

A simple yet powerful web service to validate OpenAPI (v2/v3) and AsyncAPI specification files. Upload your YAML or JSON contract, and get a clean, detailed JSON response with all errors and warnings found by [Spectral](https://github.com/stoplightio/spectral).

---

## ✨ Features

- **Easy to Use**: A single `POST` endpoint for all validations.
- **Detailed JSON Responses**: Get structured, machine-readable JSON output with line numbers, error codes, and messages.
- **Powered by Spectral**: Leverages the industry-standard linter for API specifications.
- **Customizable Rules**: Easily extend and customize the validation ruleset via a `.spectral.yaml` file.
- **Ready to Deploy**: Optimized for easy, one-click deployment on platforms like Render.

---

## 🚀 API Usage

### Endpoint: `POST /yaml/validate`

Upload your OpenAPI specification file to this endpoint to receive a validation report.

**Request:**

The request must be sent as `multipart/form-data`.

- **Method**: `POST`
- **URL**: `/yaml/validate`
- **Form Field**:
  - `key`: `file`
  - `value`: Your `api-spec.yaml` or `api-spec.json` file.

**Example `cURL` Request:**

```bash
curl --location '[https://your-service-url.onrender.com/yaml/validate](https://your-service-url.onrender.com/yaml/validate)' \
--form 'file=@"/path/to/your/api-contract.yaml"'
```

---

### Response Format

The API provides a detailed JSON response, making it easy to integrate with other tools.

**✅ Success Response (Status `200 OK` - Valid with Warnings)**

If the file is valid but contains warnings, you'll get a `200 OK` status.

```json
{
  "summary": {
    "status": "valid_with_warnings",
    "errorCount": 0,
    "warningCount": 1,
    "totalIssues": 1
  },
  "issues": [
    {
      "severity": "warn",
      "rule": "info-contact",
      "message": "Info object must have 'contact' object.",
      "path": "info",
      "location": {
        "line": 2,
        "character": 6
      }
    }
  ]
}
```

**❌ Unprocessable Entity Response (Status `422 Unprocessable Entity` - Invalid)**

If the file has validation errors, the API will return a `422` status code.

```json
{
  "summary": {
    "status": "invalid",
    "errorCount": 1,
    "warningCount": 1,
    "totalIssues": 2
  },
  "issues": [
    {
      "severity": "warn",
      "rule": "info-contact",
      "message": "Info object must have 'contact' object.",
      "path": "info",
      "location": {
        "line": 2,
        "character": 6
      }
    },
    {
      "severity": "error",
      "rule": "oas3-valid-media-example",
      "message": "'value' property must exist.",
      "path": "paths./users.post.requestBody.content.application/json.examples.example-1",
      "location": {
        "line": 52,
        "character": 20
      }
    }
  ]
}
```

---

## 🛠️ Setup and Deployment

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/jahndev/openapi-spec-validator.git](https://github.com/jahndev/openapi-spec-validator.git)
    cd openapi-spec-validator
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the server:**
    ```bash
    npm start
    ```
    The server will be running on `http://localhost:3000`.

### Deploying to Render

This project is ready for deployment on [Render](https://render.com/).

1.  Fork this repository to your GitHub account.
2.  On the Render dashboard, click **New +** > **Web Service**.
3.  Connect your GitHub account and select your forked repository.
4.  Render will automatically detect the Node.js environment and configure the following settings:
    - **Build Command**: `npm install`
    - **Start Command**: `npm start`
5.  Click **Create Web Service**. Your API will be live in minutes.

---

## ⚙️ Customizing Validation Rules

The validation logic is controlled by the `.spectral.yaml` file in the root of the project. By default, it uses the recommended ruleset for OpenAPI 3.x (`spectral:oas`).

You can easily add your own rules or modify existing ones by editing this file. For more information, see the [Spectral documentation on rulesets](https://meta.stoplight.io/docs/spectral/docs/reference/rulesets.md).

**Example `.spectral.yaml`:**

```yaml
# Inherit the recommended OpenAPI rules
extends: spectral:oas

# Add your own custom rules
rules:
  # This rule will trigger a warning if an operation is missing a summary
  operation-summary-defined:
    description: "All operations must have a summary."
    given: "$.paths.*.*"
    then:
      field: summary
      function: truthy
    severity: warn
```

---

## 🤝 Contributing

Contributions are welcome! If you have suggestions for improvements or find a bug, please feel free to open an issue or submit a pull request.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
