# Credit Card Advisor PWA

A modern, AI-powered credit card recommendation engine, refactored into a Progressive Web App (PWA).

## Features
- **PWA Ready**: Installable on mobile and desktop.
- **Offline Capable**: Basic offline support via Service Worker.
- **Responsive Design**: Optimized for all screen sizes.
- **Privacy Focused**: API keys are handled securely (client-side).

## How to Deploy to GitHub Pages

1.  **Push to GitHub**:
    - Create a new repository on GitHub.
    - Push all files in this folder to the repository.

2.  **Enable Pages**:
    - Go to **Settings** > **Pages**.
    - Under **Source**, select `Deploy from a branch`.
    - Select `main` (or `master`) branch and `/ (root)` folder.
    - Click **Save**.

3.  **Access Your App**:
    - Your app will be live at `https://<your-username>.github.io/<repo-name>/`.

## Local Development

To run locally, you need a simple HTTP server (because Service Workers and some APIs don't work on `file://`).

```bash
# Python 3
python -m http.server

# Node.js (http-server)
npx http-server
```
Then open `http://localhost:8000`.
